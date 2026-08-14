import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

// The self-contained guard is the only thing standing between us and an
// artifact that silently starts making network requests, so it gets tested
// like production code: run it against fixtures and check the exit code.
// Paths resolve from the Vitest root rather than import.meta.url, which the
// jsdom environment reports as an http:// URL.
const SCRIPT = resolve(process.cwd(), 'scripts/assert-selfcontained.mjs');
const fixture = (name: string) => resolve(process.cwd(), 'tests/fixtures', name);

function runGuard(fixtureName: string) {
  const result = spawnSync(process.execPath, [SCRIPT, fixture(fixtureName)], {
    encoding: 'utf8',
  });
  return {
    code: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

describe('assert-selfcontained build guard', () => {
  it('passes a fully inlined artifact', () => {
    const { code, output } = runGuard('clean');
    expect(output).toContain('OK');
    expect(code).toBe(0);
  });

  it('allows XML namespace URIs, which are identifiers rather than requests', () => {
    const { code, output } = runGuard('svg-namespace');
    expect(output).toContain('OK');
    expect(code).toBe(0);
  });

  it.each([
    ['external-script', /external reference in src/i],
    ['external-css', /@import/i],
    ['css-url', /external CSS asset/i],
    ['extra-asset', /only index\.html/i],
    ['network-api', /runtime network API/i],
    ['protocol-relative', /protocol-relative/i],
  ])('fails on %s', (name, expected) => {
    const { code, output } = runGuard(name);
    expect(code).toBe(1);
    expect(output).toMatch(expected);
  });
});
