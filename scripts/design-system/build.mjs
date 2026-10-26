#!/usr/bin/env node
// Builds the FolioBuddy Design System artifact's files into scripts/design-system/dist/project:
// content/ as-is, tokens.json from index.css, and the component bundle from packages/frontend/src.
// Publishing is a separate step (see README.md): the artifact keeps state this build never writes.
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPONENT_SOURCES } from './tokens.config.mjs';
import { buildTokens } from './tokens.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '../..');
const CONTENT = join(HERE, 'content');
const OUT = join(HERE, 'dist/project');
const NAMESPACE = 'FolioBuddy';
const require = createRequire(import.meta.url);

function git(...args) {
  const result = spawnSync('git', args, { cwd: REPO, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : 'unknown';
}

/** Every catalogued component needs guidelines and a preview, and vice versa. */
function checkCatalogue() {
  const folders = readdirSync(join(CONTENT, 'components'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'Cover')
    .map((entry) => entry.name);
  const catalogue = Object.keys(COMPONENT_SOURCES);
  const problems = [
    ...catalogue.flatMap((name) =>
      ['README.md', 'preview.html']
        .filter((file) => !existsSync(join(CONTENT, 'components', name, file)))
        .map((file) => `content/components/${name}/${file} is missing`)
    ),
    ...folders
      .filter((name) => !catalogue.includes(name))
      .map((name) => `content/components/${name} is not listed in COMPONENT_SOURCES`),
  ];
  if (problems.length) throw new Error(problems.join('\n'));
  return catalogue;
}

function writeTokens() {
  const css = readFileSync(join(REPO, 'packages/frontend/src/index.css'), 'utf8');
  const ref = `${git('rev-parse', '--abbrev-ref', 'HEAD')}@${git('rev-parse', '--short', 'HEAD')}`;
  const tokens = buildTokens(css, { ref, synced: new Date().toISOString().slice(0, 10) });
  writeFileSync(join(OUT, 'tokens.json'), `${JSON.stringify(tokens, null, 2)}\n`);
  return ref;
}

/** React and ReactDOM come from the page. Serving them as CommonJS modules lets both ESM
 * imports and require() calls inside dependencies (use-sync-external-store) share one copy. */
const pageGlobals = {
  name: 'design-system-page-globals',
  resolveId(id) {
    if (id === 'react/jsx-runtime' || id === 'react/jsx-dev-runtime') return '\0jsx-runtime';
    if (id === 'react') return '\0react';
    if (id === 'react-dom') return '\0react-dom';
    return null;
  },
  load(id) {
    if (id === '\0react') return 'module.exports = window.React;';
    if (id === '\0react-dom') return 'module.exports = window.ReactDOM;';
    if (id !== '\0jsx-runtime') return null;
    return `const React = window.React;
export const Fragment = React.Fragment;
export function jsx(type, props, key) {
  return React.createElement(type, key === undefined ? props : Object.assign({}, props, { key }));
}
export const jsxs = jsx;
export const jsxDEV = jsx;`;
  },
};

async function buildBundle(catalogue) {
  const { rolldown } = await import('rolldown');
  const bundle = await rolldown({
    input: join(HERE, 'bundle/entry.ts'),
    platform: 'browser',
    resolve: { alias: { '@': join(REPO, 'packages/frontend/src') } },
    transform: {
      jsx: 'react-jsx',
      define: {
        'process.env.NODE_ENV': '"production"',
        'import.meta.env': '({ MODE: "production", DEV: false, PROD: true })',
      },
    },
    plugins: [pageGlobals],
  });
  const { output } = await bundle.generate({ format: 'iife', minify: true });
  await bundle.close();
  const header = {
    format: 4,
    namespace: NAMESPACE,
    components: catalogue.map((name) => ({ name })),
  };
  const code = `/* @ds-bundle: ${JSON.stringify(header)} */\n${output[0].code}`;
  // Consumers inline the bundle in a <script> element, which these sequences would end or escape.
  if (/<\/script|<!--/i.test(code)) throw new Error('bundle.js contains </script or <!--');
  writeFileSync(join(OUT, 'components/bundle.js'), code);
}

function buildStyles() {
  const out = join(OUT, 'components/bundle.css');
  const cli = require.resolve('tailwindcss/lib/cli.js');
  const args = [
    '-c',
    join(HERE, 'bundle/tailwind.config.cjs'),
    '-i',
    join(HERE, 'bundle/input.css'),
  ];
  const result = spawnSync(process.execPath, [cli, ...args, '-o', out, '--minify'], {
    cwd: REPO,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`Tailwind failed:\n${result.stderr}`);
  if (/<\/style/i.test(readFileSync(out, 'utf8'))) throw new Error('bundle.css contains </style');
}

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)]
  );
}

async function main() {
  const catalogue = checkCatalogue();
  rmSync(join(HERE, 'dist'), { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  cpSync(CONTENT, OUT, { recursive: true });
  const ref = writeTokens();
  await buildBundle(catalogue);
  buildStyles();
  const files = listFiles(OUT);
  const kb = (file) => `${(readFileSync(join(OUT, file)).length / 1024).toFixed(1)} KB`;
  console.log(`Built ${files.length} files from ${ref} into ${relative(REPO, OUT)}`);
  console.log(
    `  ${catalogue.length} components · bundle.js ${kb('components/bundle.js')} · bundle.css ${kb('components/bundle.css')}`
  );
  console.log('Next: npm run design-system:check, then publish (scripts/design-system/README.md).');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
