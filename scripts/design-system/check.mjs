#!/usr/bin/env node
// Renders every preview in dist/ in both themes with Playwright's Chromium and fails when one
// throws, renders nothing, or takes keyboard focus from the page that hosts it. Then prints
// the contrast of the token pairs the usage notes quote.
import { chromium } from '@playwright/test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrastReport } from './contrast.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'dist/project');
const require = createRequire(import.meta.url);

/** Stand-in for the tokens.css the artifact page compiles from tokens.json (never published). */
function tokensCss(tokens) {
  const themes = tokens.color.themes.map((t) => t.id);
  const name = (n) => `--${n.replace(/\./g, '\\.')}`;
  const themed = (theme, index) => {
    const decls = ['color', 'shadow'].flatMap((family) =>
      tokens[family].tokens
        .map((t) => [
          t.name,
          typeof t.value === 'string' ? (index === 0 ? t.value : null) : t.value[theme],
        ])
        .filter(([, value]) => value)
        .map(([n, value]) => `${name(n)}: ${value};`)
    );
    const selector = index === 0 ? `:root, [data-theme="${theme}"]` : `[data-theme="${theme}"]`;
    return `${selector} { ${decls.join(' ')} }`;
  };
  const plain = ['spacing', 'radius', 'size', 'opacity', 'zIndex'].flatMap((family) =>
    tokens[family].tokens.map((t) => `${name(t.name)}: ${t.value};`)
  );
  const fonts = Object.entries(tokens.type.families).map(
    ([key, stack]) => `--font-${key}: ${stack};`
  );
  return [...themes.map(themed), `:root { ${[...plain, ...fonts].join(' ')} }`].join('\n');
}

function harness(preview, theme, css, scripts) {
  const inline = scripts.map(
    (code) => `<script>${code.replace(/<\/script/gi, '<\\/script')}</script>`
  );
  return preview
    .replace(/^<!--[^\n]*-->\n/, '')
    .replace('<html', `<html data-theme="${theme}"`)
    .replace('<head>', `<head><style>${css}</style>${inline.join('')}`);
}

async function checkPreview(browser, name, html) {
  const page = await browser.newPage({ viewport: { width: 760, height: 900 } });
  const problems = [];
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    const fromFonts = /fonts\.(googleapis|gstatic)\.com/.test(message.location().url);
    if (message.type() === 'error' && !fromFonts) problems.push(message.text());
  });
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  const state = await page.evaluate(() => ({
    rendered: Boolean(
      document.querySelector('#root')?.children.length || document.querySelector('.cover')
    ),
    focus: document.activeElement?.tagName,
  }));
  await page.close();
  if (!state.rendered) problems.push('rendered nothing');
  if (state.focus !== 'BODY') problems.push(`took focus (${state.focus})`);
  return problems.map((problem) => `${name}: ${problem}`);
}

/** Playwright's own Chromium when installed (npx playwright install chromium), else Google Chrome. */
async function launchBrowser() {
  try {
    return await chromium.launch();
  } catch (error) {
    if (!/Executable doesn't exist/.test(error.message)) throw error;
    return chromium.launch({ channel: 'chrome' });
  }
}

function printContrast(tokens) {
  console.log(
    '\nContrast of quoted pairs (update usage notes in tokens.config.mjs if these move):'
  );
  for (const row of contrastReport(tokens)) {
    const mark = row.ratio >= row.min ? '✓' : '✗';
    const pair = `${row.text} on ${row.ground}`.padEnd(42);
    console.log(
      `  ${mark} ${row.theme.padEnd(5)} ${pair} ${row.ratio.toFixed(2)}:1 (min ${row.min})`
    );
  }
}

async function main() {
  if (!existsSync(join(OUT, 'tokens.json'))) throw new Error('Run npm run design-system first.');
  const tokens = JSON.parse(readFileSync(join(OUT, 'tokens.json'), 'utf8'));
  const css = `${tokensCss(tokens)}\n${readFileSync(join(OUT, 'components/bundle.css'), 'utf8')}`;
  const scripts = [
    join(dirname(require.resolve('react/package.json')), 'umd/react.production.min.js'),
    join(dirname(require.resolve('react-dom/package.json')), 'umd/react-dom.production.min.js'),
    join(OUT, 'components/bundle.js'),
  ].map((file) => readFileSync(file, 'utf8'));
  const names = readdirSync(join(OUT, 'components')).filter((n) =>
    existsSync(join(OUT, 'components', n, 'preview.html'))
  );
  const browser = await launchBrowser();
  const problems = [];
  for (const name of names) {
    const preview = readFileSync(join(OUT, 'components', name, 'preview.html'), 'utf8');
    for (const { id: theme } of tokens.color.themes) {
      problems.push(
        ...(await checkPreview(
          browser,
          `${name} (${theme})`,
          harness(preview, theme, css, scripts)
        ))
      );
    }
  }
  await browser.close();
  console.log(`Rendered ${names.length} previews in ${tokens.color.themes.length} themes.`);
  problems.forEach((problem) => console.error(`  ✗ ${problem}`));
  printContrast(tokens);
  if (problems.length) throw new Error(`${problems.length} preview problem(s).`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
