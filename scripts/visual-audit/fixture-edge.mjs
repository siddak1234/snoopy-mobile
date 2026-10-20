/**
 * The visual audit's stand-in for the Edge (round 24 A4): answers exactly the
 * paths the audited screens call, from `fixtures/*.json`, on localhost only.
 *
 * Node built-ins only. HTTP on 127.0.0.1 and ::1, port `EDGE_PORT` (8090);
 * HTTPS on `FILES_PORT` (8443) for the signed files a package answer names,
 * with the throwaway certificate `run.sh` makes (`FILES_CERT`, `FILES_KEY`) and
 * adds to each simulator's keychain — the app downloads only over https.
 * A string "$NOW", "$NOW-2h", "$NOW+3d" in a fixture becomes that moment, so
 * "4m ago" and "Expires in 3d" stay true. A package POST is matched with its
 * format (`…/package#pdf`). Anything else answers 404 and is logged, so a
 * screen asking for something the fixtures lack is seen in the log.
 * Made-up businesses and numbers only; nothing from a real account.
 */
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures');
const index = JSON.parse(readFileSync(join(fixtures, 'index.json'), 'utf8'));
const routes = index.routes.map((route) => ({ ...route, method: route.route.split(' ')[0], pattern: new RegExp(route.path) }));
const EDGE_PORT = Number(process.env.EDGE_PORT ?? 8090);
const FILES_PORT = Number(process.env.FILES_PORT ?? 8443);

const UNIT_MS = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
/** "$NOW-2h" → that moment, as an ISO string; anything else unchanged. */
function moment(value) {
  const match = /^\$NOW(?:([+-])(\d+)([smhd]))?$/u.exec(value);
  if (!match) return value;
  const offset = match[1] ? (match[1] === '-' ? -1 : 1) * Number(match[2]) * UNIT_MS[match[3]] : 0;
  return new Date(Date.now() + offset).toISOString();
}
function withMoments(value) {
  if (typeof value === 'string') return moment(value);
  if (Array.isArray(value)) return value.map(withMoments);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, withMoments(inner)]));
  return value;
}

function send(response, status, body, type = 'application/json') {
  const bytes = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  response.end(bytes);
}

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

async function edge(request, response) {
  const url = request.url ?? '/';
  let key = url;
  if (request.method === 'POST' && /\/package$/u.test(url.split('?')[0])) {
    try {
      key = `${url}#${JSON.parse(await readBody(request)).format}`;
    } catch {
      key = `${url}#`;
    }
  }
  const route = routes.find((entry) => entry.method === request.method && entry.pattern.test(key));
  if (!route) {
    process.stderr.write(`fixture-edge: unrouted ${request.method} ${url}\n`);
    send(response, 404, { status: 404, title: 'Not in the fixtures' }, 'application/problem+json');
    return;
  }
  process.stdout.write(`fixture-edge: ${request.method} ${url} -> ${route.file}\n`);
  send(response, 200, withMoments(JSON.parse(readFileSync(join(fixtures, route.file), 'utf8'))));
}

/** A one-page PDF in the standard fonts, written by hand: the package's stand-in. */
function packagePdf() {
  const lines = [
    'A8X - Run package (visual audit fixture)',
    'Invoice Processing',
    `Run ${index.runs.done}`,
    'Harbor & Pine Supply',
    'Invoices: 3    Total: $454.75',
  ];
  const text = lines
    .map((line, n) => `BT /F1 ${n === 0 ? 20 : 12} Tf 56 ${720 - n * 28} Td (${line.replace(/[()\\]/gu, '\\$&')}) Tj ET`)
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((object, n) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${n + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

function files(request, response) {
  if (request.method === 'GET' && request.url?.startsWith('/files/run-package.pdf')) {
    send(response, 200, packagePdf(), 'application/octet-stream');
    return;
  }
  process.stderr.write(`fixture-edge: unrouted file ${request.method} ${request.url}\n`);
  send(response, 404, 'not found', 'text/plain');
}

for (const host of ['127.0.0.1', '::1']) {
  createServer((request, response) => void edge(request, response)).listen(EDGE_PORT, host);
}
if (process.env.FILES_CERT && process.env.FILES_KEY) {
  const tls = { cert: readFileSync(process.env.FILES_CERT), key: readFileSync(process.env.FILES_KEY) };
  for (const host of ['127.0.0.1', '::1']) createSecureServer(tls, files).listen(FILES_PORT, host);
}
process.stdout.write(`fixture-edge: listening on ${EDGE_PORT}${process.env.FILES_CERT ? ` and ${FILES_PORT} (https)` : ''}\n`);
