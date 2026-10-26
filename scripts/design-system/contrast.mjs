// WCAG 2 contrast for the token pairs the usage notes quote, so a colour change shows
// which notes need new figures. Understands the formats tokens.json uses: hsl(), oklch(), hex.

/** Text pairs need 4.5:1; focus rings and section icons need 3:1. */
export const PAIRS = [
  ...['background', 'card', 'muted', 'accent'].map((ground) => ['foreground', ground, 4.5]),
  ...['background', 'card', 'muted', 'accent'].map((ground) => ['muted-foreground', ground, 4.5]),
  ['primary-text', 'background', 4.5],
  ['primary-text', 'card', 4.5],
  ['primary-foreground', 'primary', 4.5],
  ['destructive-foreground', 'destructive', 4.5],
  ...['profit', 'loss', 'warning', 'info'].flatMap((tone) => [
    [`${tone}-foreground`, 'background', 4.5],
    [`${tone}-foreground`, 'card', 4.5],
  ]),
  ['ring', 'card', 3],
  ...['crypto', 'equities', 'cash', 'custody', 'macro'].map((name) => [
    `accent-${name}`,
    'card',
    3,
  ]),
];

const clamp = (value) => Math.min(1, Math.max(0, value));

function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map((n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)));
}

function oklchToRgb(lightness, chroma, hue) {
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return linear.map((c) => clamp(c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
}

/** Screens show 8-bit channels, so ratios are computed on what is displayed. */
const display = (channels) => channels.map((c) => Math.round(clamp(c) * 255) / 255);

/** sRGB channels 0-1, or null for a format this module does not read. */
export function parseColor(value) {
  const numbers = (text) => text.replace(/%/g, '').trim().split(/\s+/).map(Number);
  let match = /^hsl\(([^)]+)\)$/.exec(value);
  if (match) {
    const [h, s, l] = numbers(match[1]);
    return display(hslToRgb(h, s / 100, l / 100));
  }
  match = /^oklch\(([^)]+)\)$/.exec(value);
  if (match) return display(oklchToRgb(...numbers(match[1])));
  match = /^#([0-9a-f]{6})$/i.exec(value);
  if (match) return [0, 2, 4].map((i) => parseInt(match[1].slice(i, i + 2), 16) / 255);
  return null;
}

function luminance([r, g, b]) {
  const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrastRatio(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/** Rows of { theme, text, ground, ratio, min } for every pair in every theme. */
export function contrastReport(tokens) {
  const colors = Object.fromEntries(tokens.color.tokens.map((t) => [t.name, t.value]));
  const first = tokens.color.themes[0].id;
  const valueIn = (name, theme) => {
    const value = colors[name];
    return typeof value === 'string' ? value : (value[theme] ?? value[first]);
  };
  return tokens.color.themes.flatMap(({ id: theme }) =>
    PAIRS.map(([text, ground, min]) => {
      const ratio = contrastRatio(
        parseColor(valueIn(text, theme)),
        parseColor(valueIn(ground, theme))
      );
      return { theme, text, ground, ratio, min };
    })
  );
}
