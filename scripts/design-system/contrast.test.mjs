import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { contrastRatio, contrastReport, parseColor } from './contrast.mjs';
import { buildTokens } from './tokens.mjs';

const indexCss = readFileSync(
  fileURLToPath(new URL('../../packages/frontend/src/index.css', import.meta.url)),
  'utf8'
);

test('parses the colour formats tokens.json uses', () => {
  assert.deepEqual(parseColor('hsl(0 0% 100%)'), [1, 1, 1]);
  assert.deepEqual(parseColor('#000000'), [0, 0, 0]);
  const white = parseColor('oklch(1 0 0)').map((c) => Math.round(c * 1000) / 1000);
  assert.deepEqual(white, [1, 1, 1]);
  assert.equal(parseColor('rgb(0 0 0 / 0.6)'), null);
});

test('computes WCAG contrast', () => {
  assert.equal(contrastRatio([1, 1, 1], [0, 0, 0]), 21);
  assert.equal(contrastRatio([0.5, 0.5, 0.5], [0.5, 0.5, 0.5]), 1);
});

test('matches the figures quoted in the usage notes', () => {
  const rows = contrastReport(buildTokens(indexCss, { ref: 'x@y', synced: '2026-10-26' }));
  const ratio = (theme, text, ground) =>
    rows.find((r) => r.theme === theme && r.text === text && r.ground === ground).ratio.toFixed(2);
  assert.equal(ratio('dark', 'primary-text', 'card'), '5.39');
  assert.equal(ratio('light', 'muted-foreground', 'accent'), '4.35');
  assert.equal(ratio('light', 'accent-equities', 'card'), '1.97');
});
