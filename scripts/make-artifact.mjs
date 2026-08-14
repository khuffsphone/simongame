#!/usr/bin/env node
// Repackage dist/index.html for a host that supplies its own document skeleton
// (the Artifact viewer wraps published content in <!doctype><head></head><body>).
//
// This only strips the outer document tags and the two head-only metas the host
// owns. It inlines nothing new and fetches nothing — the output is the same
// self-contained bundle, so `assert-selfcontained` is re-run against it.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = join(ROOT, 'dist', 'index.html');
const OUT_DIR = join(ROOT, 'artifact');
const OUT_FILE = join(OUT_DIR, 'index.html');

let html = readFileSync(SOURCE, 'utf8');

const strip = (pattern) => {
  html = html.replace(pattern, '');
};

// Outer document tags — the host provides these.
strip(/<!doctype html>\s*/i);
strip(/<html[^>]*>\s*/i);
strip(/<\/html>\s*/i);
strip(/<head[^>]*>\s*/i);
strip(/<\/head>\s*/i);
strip(/<body[^>]*>\s*/i);
strip(/<\/body>\s*/i);

// Head-only metas the host controls. Everything else (title, color-scheme,
// theme-color, the inlined script and style) is kept in document order.
strip(/<meta\s+charset=[^>]*>\s*/i);
strip(/<meta\s+name="viewport"[\s\S]*?\/>\s*/i);

html = `${html.trim()}\n`;

if (!/<title>/i.test(html)) throw new Error('artifact lost its <title>');
if (!/id="app"/.test(html)) throw new Error('artifact lost its #app container');
if (html.indexOf('<title>') > 8192) throw new Error('<title> pushed past the 8KB scan window');

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, html, 'utf8');

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log(`make-artifact: wrote artifact/index.html (${kb} kB)`);
