#!/usr/bin/env node
// Build assertion: the shipped artifact must be ONE self-contained index.html
// with no external references and no runtime network calls. Runs as the last
// step of `npm run build`; a non-zero exit fails the build.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// Defaults to ./dist; an explicit path lets the guard be tested against fixtures.
const DIST = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, 'dist');

const failures = [];
const fail = (msg) => failures.push(msg);

// ---------------------------------------------------------------------------
// 1. dist/ must contain exactly one file: index.html
// ---------------------------------------------------------------------------
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

let files;
try {
  files = walk(DIST).map((f) => relative(DIST, f).split('\\').join('/'));
} catch {
  console.error('assert-selfcontained: dist/ not found — run `vite build` first.');
  process.exit(1);
}

const extras = files.filter((f) => f !== 'index.html');
if (!files.includes('index.html')) fail('dist/index.html is missing.');
for (const extra of extras) {
  fail(`dist/ must contain only index.html, but also emitted: ${extra}`);
}

const html = readFileSync(join(DIST, 'index.html'), 'utf8');

// ---------------------------------------------------------------------------
// 2. No external URL references
// ---------------------------------------------------------------------------

// XML namespace URIs are identifiers, not fetches — inline SVG/MathML need them.
const NAMESPACE_URIS = [
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xlink',
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/1998/Math/MathML',
];
const isNamespaceUri = (url) => NAMESPACE_URIS.includes(url.replace(/\/$/, ''));

// Values that never hit the network.
const INERT_PREFIXES = ['data:', 'blob:', '#', 'javascript:void'];
const isInert = (value) => {
  const v = value.trim();
  if (v === '') return true;
  return INERT_PREFIXES.some((p) => v.toLowerCase().startsWith(p));
};

const lineOf = (index) => html.slice(0, index).split('\n').length;

// 2a. URL-bearing attributes must be inert.
const URL_ATTRS = ['src', 'href', 'srcset', 'poster', 'action', 'formaction', 'data', 'manifest'];
const attrRe = new RegExp(`\\b(${URL_ATTRS.join('|')})\\s*=\\s*("([^"]*)"|'([^']*)')`, 'gi');
for (const m of html.matchAll(attrRe)) {
  const value = m[3] ?? m[4] ?? '';
  if (isInert(value)) continue;
  fail(`external reference in ${m[1]}="${truncate(value)}" (line ${lineOf(m.index)})`);
}

// 2b. CSS url(...) must be inert.
for (const m of html.matchAll(/url\(\s*(['"]?)([^)'"]*)\1\s*\)/gi)) {
  const value = m[2] ?? '';
  if (isInert(value)) continue;
  fail(`external CSS asset url(${truncate(value)}) (line ${lineOf(m.index)})`);
}

// 2c. @import pulls in a stylesheet over the network.
for (const m of html.matchAll(/@import\b/gi)) {
  fail(`@import found (line ${lineOf(m.index)}) — stylesheets must be inlined`);
}

// 2d. Any remaining absolute or protocol-relative URL literal.
for (const m of html.matchAll(/\bhttps?:\/\/[^\s"'`)<>]+/gi)) {
  if (isNamespaceUri(m[0])) continue;
  fail(`absolute URL literal ${truncate(m[0])} (line ${lineOf(m.index)})`);
}
for (const m of html.matchAll(/(["'`(=])\/\/[a-z0-9-]+\.[a-z]{2,}[^\s"'`)<>]*/gi)) {
  fail(`protocol-relative URL ${truncate(m[0].slice(1))} (line ${lineOf(m.index)})`);
}

// ---------------------------------------------------------------------------
// 3. No runtime network APIs
// ---------------------------------------------------------------------------
const NETWORK_APIS = [
  /\bfetch\s*\(/g,
  /\bXMLHttpRequest\b/g,
  /\bnew\s+WebSocket\b/g,
  /\bnew\s+EventSource\b/g,
  /\bnavigator\s*\.\s*sendBeacon\b/g,
  /\bimportScripts\s*\(/g,
  /\bnavigator\s*\.\s*serviceWorker\b/g,
];
for (const re of NETWORK_APIS) {
  for (const m of html.matchAll(re)) {
    fail(`runtime network API \`${m[0].trim()}\` (line ${lineOf(m.index)})`);
  }
}

function truncate(s) {
  return s.length > 80 ? `${s.slice(0, 77)}...` : s;
}

// ---------------------------------------------------------------------------
if (failures.length > 0) {
  console.error(`\nassert-selfcontained: FAILED (${failures.length} problem(s))\n`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error('\nThe artifact must be a single index.html with zero external references.\n');
  process.exit(1);
}

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log(`assert-selfcontained: OK — dist/index.html is self-contained (${kb} kB, no external refs)`);
