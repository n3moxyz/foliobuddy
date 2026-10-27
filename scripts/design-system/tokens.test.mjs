import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { TOKEN_NAME, buildTokens, parseThemeBlocks } from './tokens.mjs';

const indexCss = readFileSync(
  fileURLToPath(new URL('../../packages/frontend/src/index.css', import.meta.url)),
  'utf8'
);
const source = { ref: 'main@abc1234', synced: '2026-10-26' };
const byName = (doc) => Object.fromEntries(doc.color.tokens.map((t) => [t.name, t]));

test('reads both theme blocks from index.css', () => {
  const { light, dark } = parseThemeBlocks(indexCss);
  assert.equal(light.background, '230 25% 99%');
  assert.equal(dark.background, '234 25% 9%');
  assert.ok(!('radius' in dark), 'radius is defined once, in :root');
});

test('puts the dark theme first, because the app defaults to dark', () => {
  const doc = buildTokens(indexCss, source);
  assert.deepEqual(
    doc.color.themes.map((t) => t.id),
    ['dark', 'light']
  );
  assert.deepEqual(byName(doc).background.value, {
    dark: 'hsl(234 25% 9%)',
    light: 'hsl(230 25% 99%)',
  });
});

test('wraps channels the way the app consumes them', () => {
  const tokens = byName(buildTokens(indexCss, source));
  assert.match(tokens.primary.value.dark, /^hsl\(\d/);
  assert.match(tokens['chart-btc'].value.dark, /^oklch\(0\.\d+ /);
});

test('keeps theme-invariant colours as one value', () => {
  const tokens = byName(buildTokens(indexCss, source));
  assert.equal(tokens['accent-crypto'].value, 'hsl(217 91% 60%)');
  assert.equal(tokens['mark-violet'].value, '#665cf6');
});

test('covers every index.css colour variable', () => {
  const { light } = parseThemeBlocks(indexCss);
  const tokens = byName(buildTokens(indexCss, source));
  for (const name of Object.keys(light).filter((n) => n !== 'radius')) {
    assert.ok(tokens[name]?.usage, `${name} has a token with a usage note`);
  }
});

test('derives the focus ring from background and ring in each theme', () => {
  const doc = buildTokens(indexCss, source);
  const ring = doc.shadow.tokens.find((t) => t.name === 'focus-ring');
  assert.equal(ring.value.dark, '0 0 0 2px hsl(234 25% 9%), 0 0 0 4px hsl(234 89% 62%)');
  assert.equal(ring.value.light, '0 0 0 2px hsl(230 25% 99%), 0 0 0 4px hsl(234 89% 55%)');
});

test('uses unique names the page can read', () => {
  const doc = buildTokens(indexCss, source);
  const families = ['color', 'spacing', 'radius', 'shadow', 'size', 'opacity', 'zIndex'];
  const names = families.flatMap((family) => doc[family].tokens.map((t) => t.name));
  assert.equal(new Set(names).size, names.length);
  for (const name of names) assert.match(name, TOKEN_NAME);
});

test('fails when a new colour variable has no usage note', () => {
  const css = indexCss.replace(
    '--background: 230 25% 99%;',
    '--background: 230 25% 99%;\n    --brand-new: 1 2% 3%;'
  );
  assert.throws(() => buildTokens(css, source), /Add usage notes .*brand-new/);
});

test('fails when a note outlives its variable', () => {
  const css = indexCss.replace(/--accent-macro: [^;]+;/, '');
  assert.throws(() => buildTokens(css, source), /no longer has: accent-macro/);
});

test('records the source ref and component paths', () => {
  const { meta } = buildTokens(indexCss, source);
  assert.equal(meta.ref, 'main@abc1234');
  assert.equal(meta.components.Button, 'packages/frontend/src/components/ui/button.tsx');
});
