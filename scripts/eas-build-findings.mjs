/**
 * EAS's own verdicts on a release: the cloud build's and the submission's server logs.
 *
 * release-ios.sh's client log holds only what eas-cli printed. EAS's build runs
 * expo doctor in its RUN_EXPO_DOCTOR phase but ends a failed check as a warning,
 * never a failed build, so build 46 shipped "20/21 checks passed" read by no one.
 * After a cloud build the script saves `build:view --json`, downloads each of its
 * `logFiles` (signed URLs, never printed) into one folder, and runs:
 *   node scripts/eas-build-findings.mjs build <folder>
 * and after the submission, the submission's `logFiles` the same way:
 *   node scripts/eas-build-findings.mjs submission <folder>
 *
 * A JSON log is one object a line, @expo/eas-build-job's logger: `phase`, `level`
 * (bunyan's: 30 info, 40 warn, 50 error), `msg`, and on a phase's first and last
 * line `marker` START_PHASE or END_PHASE, the last with `result` success, failed,
 * warning, skipped or unknown (@expo/eas-build-job dist/logs.js). The Xcode log
 * beside it is plain text and is not read for verdicts. The storage serves every
 * file brotli-encoded, which macOS's curl cannot decode (read 2026-11-27), so each
 * file is decoded here: gzip, brotli or plain.
 *
 * build prints the build environment (`EAS build environment:` the VM image and
 * its Xcode), `EAS phase <NAME>: <result>` for each phase that did not end in
 * success, and the doctor's summary and failed checks; it exits 1 with
 * `REFUSED: ...` when the logs are empty or cannot be read, or the RUN_EXPO_DOCTOR
 * phase is missing or did not end in success. submission prints each line at warn
 * level or above and each line naming an ITMS- code, and never refuses: the
 * upload is done.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';

const DOCTOR = 'RUN_EXPO_DOCTOR';
const LEVELS = { 10: 'trace', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal' };

/** A log file's bytes as text: gzip by its magic number, else plain JSON, else brotli, else as it is. */
export function decodeLog(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) return gunzipSync(bytes).toString('utf8');
  const text = bytes.toString('utf8');
  if (/^\s*\{/u.test(text) || bytes.length === 0) return text;
  try {
    return brotliDecompressSync(bytes).toString('utf8');
  } catch {
    return text;
  }
}

/** A URL's query is its signature: never printed. */
const unsigned = (text) => text.replace(/(https?:\/\/[^\s?#]+)[?#]\S*/gu, '$1?…');
const message = (entry) => unsigned(String(entry.msg ?? '').trim());
const nonEmptyLines = (text) => text.split('\n').filter((line) => line.trim() !== '');

/**
 * The JSON logs' lines, or why there are none. A file whose first line is not a
 * JSON object is plain text (the Xcode log); in a JSON log, every line must be one.
 * @returns {{ entries: object[], plain: string[][] } | { error: string }}
 */
export function readLogs(texts) {
  const files = (texts ?? []).map(nonEmptyLines).filter((lines) => lines.length > 0);
  if (files.length === 0) return { error: 'are empty' };
  const entries = [];
  const plain = [];
  for (const [index, lines] of files.entries()) {
    if (!lines[0].trimStart().startsWith('{')) {
      plain.push(lines);
      continue;
    }
    for (const [at, line] of lines.entries()) {
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        entry = undefined;
      }
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        return { error: `cannot be read: log ${index + 1} line ${at + 1} is not a JSON object` };
      }
      entries.push(entry);
    }
  }
  if (entries.length === 0) return { error: `cannot be read: none of the ${files.length} files is a JSON log` };
  return { entries, plain };
}

/**
 * The build's findings and whether the release may go on.
 * @returns {{ ok: boolean, lines: string[], reason?: string }}
 */
export function buildVerdict(texts) {
  const read = readLogs(texts);
  if ('error' in read) return { ok: false, lines: [], reason: `EAS's build logs ${read.error}` };
  const { entries } = read;
  const lines = [];

  const environment = entries
    .filter((entry) => entry.phase === 'SPIN_UP_BUILDER')
    .map(message)
    .filter((text) => /^Using VM template /u.test(text) || /^- Xcode \d/u.test(text))
    .map((text) => `EAS build environment: ${text.replace(/^- /u, '')}`);
  lines.push(...(environment.length > 0 ? environment : ['EAS build environment: not named in the log']));

  const open = new Set();
  for (const entry of entries) {
    if (entry.marker === 'START_PHASE') open.add(entry.phase);
    if (entry.marker !== 'END_PHASE') continue;
    open.delete(entry.phase);
    if (entry.result !== 'success') lines.push(`EAS phase ${entry.phase}: ${entry.result ?? 'no result'}`);
  }
  for (const phase of open) lines.push(`EAS phase ${phase}: started, never ended`);

  const doctor = entries.filter((entry) => entry.phase === DOCTOR);
  for (const text of doctor.map(message)) {
    if (/\d+\/\d+ checks passed/u.test(text)) lines.push(`EAS doctor: ${text}`);
    if (text.startsWith('✖')) lines.push(`EAS doctor failed check: ${text.replace(/^✖\s*/u, '')}`);
  }

  const end = doctor.filter((entry) => entry.marker === 'END_PHASE').at(-1);
  if (!end) return { ok: false, lines, reason: `EAS's build logs have no end of the ${DOCTOR} phase: EAS's doctor verdict is unknown` };
  if (end.result !== 'success') {
    return { ok: false, lines, reason: `EAS's expo doctor phase (${DOCTOR}) ended ${end.result ?? 'with no result'}, not success` };
  }
  return { ok: true, lines };
}

/** The submission's warnings, errors and ITMS- lines; never a refusal. */
export function submissionLines(texts) {
  const files = (texts ?? []).map(nonEmptyLines).filter((lines) => lines.length > 0);
  if (files.length === 0) return ['EAS submission logs: none'];
  const lines = [];
  for (const file of files) {
    const json = file[0].trimStart().startsWith('{');
    for (const line of file) {
      let entry;
      try {
        entry = json ? JSON.parse(line) : undefined;
      } catch {
        entry = undefined;
      }
      if (entry && typeof entry === 'object') {
        const text = message(entry);
        const codes = [...new Set(JSON.stringify(entry).match(/ITMS-\d+/gu) ?? [])].filter((code) => !text.includes(code));
        if (Number(entry.level) >= 40 || codes.length > 0 || text.includes('ITMS-')) {
          const label = LEVELS[entry.level] ?? `level ${entry.level ?? 'none'}`;
          lines.push(`EAS submission ${label}: ${text}${codes.length > 0 ? ` (${codes.join(', ')})` : ''}`);
        }
      } else if (line.includes('ITMS-')) {
        lines.push(`EAS submission: ${unsigned(line.trim())}`);
      }
    }
  }
  return lines.length > 0 ? lines : ['EAS submission logs: no warning, error or ITMS- line'];
}

/** Every file in `folder`, decoded, in name order. */
function readFolder(folder) {
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .sort()
    .map((name) => join(folder, name))
    .filter((path) => statSync(path).isFile())
    .map((path) => decodeLog(readFileSync(path)));
}

// process.exitCode, never process.exit(): stdout to a pipe is asynchronous on
// macOS, and an exit can cut the findings short.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, folder] = process.argv.slice(2);
  if (!['build', 'submission'].includes(mode) || !folder) {
    console.error('usage: node scripts/eas-build-findings.mjs build|submission <folder>');
    process.exitCode = 2;
  } else if (mode === 'submission') {
    let lines;
    try {
      lines = submissionLines(readFolder(folder));
    } catch (error) {
      lines = [`EAS submission logs: cannot be read: ${error.message}`];
    }
    console.log(lines.join('\n'));
  } else {
    let verdict;
    try {
      verdict = buildVerdict(readFolder(folder));
    } catch (error) {
      verdict = { ok: false, lines: [], reason: `EAS's build logs cannot be read: ${error.message}` };
    }
    if (verdict.lines.length > 0) console.log(verdict.lines.join('\n'));
    if (!verdict.ok) {
      console.log(`REFUSED: ${verdict.reason}`);
      process.exitCode = 1;
    }
  }
}
