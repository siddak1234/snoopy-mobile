/**
 * The release gate's all-green: the one from ci.yml's PUSH run on HEAD.
 *
 * The nightly (nightly.yml, NIGHT-7) calls ci.yml, so an unchanged main can
 * carry a second all-green check run on the same commit: `CI / all-green` (a
 * called workflow's checks are named `<caller job> / <job>`), in the nightly
 * run's own check suite. Counting every all-green on HEAD would then refuse
 * every release from that commit, or pass on the nightly's verdict. This keeps
 * only the check named all-green in the check suite of ci.yml's newest push
 * run for HEAD, as snoopy-backend's scripts/release.mjs does, and refuses
 * anything else.
 *
 * scripts/release-ios.sh saves the two `gh api` answers and runs:
 *   node scripts/all-green-on-head.mjs <push-runs.json> <check-runs.json> <app id>
 * push-runs.json:  repos/<repo>/actions/workflows/ci.yml/runs?head_sha=<sha>&event=push
 * check-runs.json: repos/<repo>/commits/<sha>/check-runs?check_name=all-green
 * It prints "<status> <conclusion> <url>" and exits 0, or "REFUSED: ..." and 1.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The push run's all-green, or why there is none.
 * @returns {{ ok: true, check: object } | { ok: false, reason: string }}
 */
export function pickAllGreen({ pushRuns, checkRuns, appId }) {
  const runs = (pushRuns?.workflow_runs ?? []).filter((run) => run.event === 'push');
  if (runs.length === 0) return { ok: false, reason: 'no push run of ci.yml on HEAD' };
  // The API lists the newest run first; a re-run keeps its check suite.
  const suite = runs[0].check_suite_id;
  const inSuite = (checkRuns?.check_runs ?? []).filter(
    (check) => check.name === 'all-green' && check.app?.id === appId && check.check_suite?.id === suite,
  );
  if (inSuite.length !== 1) {
    return {
      ok: false,
      reason: `expected exactly one all-green check run from GitHub Actions in the push run's check suite ${suite}, found ${inSuite.length}`,
    };
  }
  const [check] = inSuite;
  if (check.status !== 'completed' || check.conclusion !== 'success') {
    return { ok: false, reason: `the push run's all-green is ${check.status}/${check.conclusion}, not completed/success: ${check.html_url}` };
  }
  return { ok: true, check };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [pushPath, checksPath, appId] = process.argv.slice(2);
  if (!pushPath || !checksPath || !/^\d+$/.test(appId ?? '')) {
    console.error('usage: node scripts/all-green-on-head.mjs <push-runs.json> <check-runs.json> <app id>');
    process.exit(2);
  }
  let verdict;
  try {
    verdict = pickAllGreen({
      pushRuns: JSON.parse(readFileSync(pushPath, 'utf8')),
      checkRuns: JSON.parse(readFileSync(checksPath, 'utf8')),
      appId: Number(appId),
    });
  } catch (error) {
    verdict = { ok: false, reason: `cannot read the GitHub answers: ${error.message}` };
  }
  if (!verdict.ok) {
    console.log(`REFUSED: ${verdict.reason}`);
    process.exit(1);
  }
  console.log(`${verdict.check.status} ${verdict.check.conclusion} ${verdict.check.html_url}`);
}
