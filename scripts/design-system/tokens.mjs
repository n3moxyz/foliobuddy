// Builds the design system's tokens.json from the frontend's index.css theme variables
// plus the notes and scales in tokens.config.mjs. Pure: no file or git access.
import {
  COLOR_NOTE,
  COLOR_USAGE,
  COMPONENT_SOURCES,
  EXTRA_COLORS,
  FAMILIES,
  FOCUS_RING_USAGE,
  THEMES,
  TYPE,
} from './tokens.config.mjs';

/** The page reads token names matching this pattern; anything else is dropped. */
export const TOKEN_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

const COMPONENTS_DIR = 'packages/frontend/src/components/';

/** Custom properties of the `:root` (light) and `.dark` blocks, in source order. */
export function parseThemeBlocks(css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const block = (selector) => {
    const match = new RegExp(`(?:^|\\n)\\s*${selector}\\s*\\{([^}]*)\\}`).exec(source);
    if (!match) throw new Error(`index.css has no ${selector} block`);
    return Object.fromEntries(
      [...match[1].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map(([, name, value]) => [
        name,
        value.trim(),
      ])
    );
  };
  return { light: block(':root'), dark: block('\\.dark') };
}

/** index.css stores bare channels; the app wraps chart tokens in oklch() and the rest in hsl(). */
function colorValue(name, channels) {
  return name.startsWith('chart-') ? `oklch(${channels})` : `hsl(${channels})`;
}

function colorTokens({ light, dark }) {
  const names = Object.keys(light).filter((name) => name !== 'radius');
  const missing = names.filter((name) => !(name in COLOR_USAGE));
  const stale = Object.keys(COLOR_USAGE).filter((name) => !names.includes(name));
  if (missing.length || stale.length) {
    throw new Error(
      [
        missing.length && `Add usage notes in tokens.config.mjs for: ${missing.join(', ')}`,
        stale.length && `Remove notes for variables index.css no longer has: ${stale.join(', ')}`,
      ]
        .filter(Boolean)
        .join('\n')
    );
  }
  return names.map((name) => {
    const darkValue = colorValue(name, dark[name] ?? light[name]);
    const lightValue = colorValue(name, light[name]);
    const value = darkValue === lightValue ? darkValue : { dark: darkValue, light: lightValue };
    return { name, value, usage: COLOR_USAGE[name] };
  });
}

function focusRing(themes) {
  const ring = (theme) =>
    `0 0 0 2px ${colorValue('background', theme.background)}, 0 0 0 4px ${colorValue('ring', theme.ring)}`;
  return {
    name: 'focus-ring',
    value: { dark: ring({ ...themes.light, ...themes.dark }), light: ring(themes.light) },
    usage: FOCUS_RING_USAGE,
  };
}

function assertNames(doc) {
  const families = ['color', ...Object.keys(FAMILIES)];
  const names = families.flatMap((family) => doc[family].tokens.map((t) => t.name));
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  const invalid = names.filter((name) => !TOKEN_NAME.test(name));
  if (duplicates.length) throw new Error(`Duplicate token names: ${duplicates.join(', ')}`);
  if (invalid.length) throw new Error(`Token names the page cannot read: ${invalid.join(', ')}`);
}

/**
 * @param {string} indexCss contents of packages/frontend/src/index.css
 * @param {{ ref: string, synced: string }} source git ref ("branch@sha") and sync date
 */
export function buildTokens(indexCss, source) {
  const themes = parseThemeBlocks(indexCss);
  const doc = {
    name: 'FolioBuddy',
    version: 1,
    meta: {
      source: 'github',
      repo: 'n3moxyz/foliobuddy',
      ref: source.ref,
      package: 'packages/frontend',
      paths: {
        tokens: [
          'packages/frontend/src/index.css',
          'packages/frontend/tailwind.config.js',
          'packages/frontend/src/lib/chartColors.ts',
        ],
        fonts: ['packages/frontend/index.html'],
        assets: [
          'packages/frontend/public/logo.svg',
          'packages/frontend/public/apple-touch-icon.png',
          'packages/frontend/public/icons',
        ],
        docs: ['PRODUCT.md', 'docs/UI-CONTRACTS.md', 'CLAUDE.md'],
        components: [
          `${COMPONENTS_DIR}ui`,
          `${COMPONENTS_DIR}layout`,
          `${COMPONENTS_DIR}portfolio/CollapsibleCard.tsx`,
        ],
      },
      synced: source.synced,
      components: Object.fromEntries(
        Object.entries(COMPONENT_SOURCES).map(([name, file]) => [name, COMPONENTS_DIR + file])
      ),
    },
    color: { themes: THEMES, note: COLOR_NOTE, tokens: [...colorTokens(themes), ...EXTRA_COLORS] },
    type: TYPE,
    ...FAMILIES,
  };
  doc.shadow = { ...FAMILIES.shadow, tokens: [...FAMILIES.shadow.tokens, focusRing(themes)] };
  assertNames(doc);
  return doc;
}
