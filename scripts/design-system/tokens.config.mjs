// Hand-written half of tokens.json. Colour VALUES come from packages/frontend/src/index.css;
// this file holds their usage notes and every non-colour family. The build fails when a
// colour variable has no note here, or a note has no variable, so the two cannot drift.
//
// Contrast ratios in the notes are written by hand. When a colour changes, run
// `npm run design-system:check`, read its contrast table, and update the affected notes.

export const THEMES = [
  { id: 'dark', name: 'Dark' },
  { id: 'light', name: 'Light' },
];

export const COLOR_NOTE =
  'Dark is the default and the tuned theme. Fill tokens and their -foreground/-text partners are separate on purpose: a fill tuned for surfaces is not always legible as text.';

const CHART_USAGE = buildChartUsage();

/** Usage note per index.css colour variable, by name without the leading `--`. */
export const COLOR_USAGE = {
  background:
    'Page ground behind everything (`bg-background`). Also fills inputs, outline buttons and dialogs, and is the 2px gap inside `focus-ring`.',
  foreground:
    'Primary text and icons on `background`, `card`, `popover`, `muted`, `secondary` and `accent` (12.4:1 or more in both themes).',
  card: 'Raised surfaces: cards, the sidebar, the mobile nav drawer and chart plots (`CHART_SURFACE_COLOR`). It sits one quiet step off `background`, so `border` does the separating.',
  'card-foreground': 'Text on `card` (same value as `foreground`).',
  popover:
    'Floating layers: menus, select lists, popovers, tooltips. Equals `card` in dark and `background` in light.',
  'popover-foreground': 'Text on `popover`.',
  primary:
    'Indigo FILL: the one primary button per view, checked checkboxes, selected tints (10%, border 30%). Not for words: in dark it is only 3.3:1 on `card`, so text uses `primary-text`.',
  'primary-foreground': 'Label and icon on a `primary` fill (5.0:1 dark, 6.7:1 light).',
  secondary: 'Fill of secondary buttons (`variant="secondary"`).',
  'secondary-foreground': 'Text on `secondary`.',
  muted:
    'Quiet fills: the tab-list track, kbd chips, the avatar disc, skeleton base, table-row hover (50%) and menu separators.',
  'muted-foreground':
    'Secondary text (labels, metadata, helper copy, table headers) on `background`, `card` and `muted`: 4.9:1 or more dark, 4.6:1 or more light. Light misses AA on `accent` (4.35:1, source pair), so keep muted text off accent-filled rows. Set text at full opacity; the source bans opacity variants at 11px.',
  accent:
    'Hover and keyboard-focus fill for ghost and outline buttons, menu items and select items (`hover:bg-accent`).',
  'accent-foreground': 'Text on `accent`.',
  destructive:
    'Fill of destructive buttons (Delete). As text it fails in dark (1.9:1), so `.text-destructive` is remapped to `loss-foreground`.',
  'destructive-foreground': 'Label on a `destructive` fill (8.4:1 dark, 4.6:1 light).',
  border:
    'Every hairline: card edges, table rows, header rules, separators (the global `* { border-color }`). Decorative: 1.3:1 on `background` in both themes (source value, under the 3:1 floor), so never let it be the only cue for a control.',
  input:
    'Borders of inputs, select triggers and outline buttons. Source value, 1.3:1 on `background` in both themes (under 3:1): fields also rely on their 40-44px height, placeholder text and the focus ring.',
  ring: 'Keyboard focus ring colour: 2px, offset 2px by `background` (see `focus-ring`). 3.3:1 on `card` dark, 6.5:1 light.',
  'primary-text':
    'Indigo as TEXT: links, the active sidebar item, selected states and `.text-primary` (remapped here). 5.4:1 on `card` dark, 6.5:1 light, 5.0:1 on a `primary` 10% tint.',
  profit:
    'Gain FILL: the 12% tint behind positive P&L pills and imported rows (`.bg-profit`). Never text: words use `profit-foreground`.',
  'profit-foreground':
    'Gain TEXT and icons (`.text-profit`) on `background` and `card` (12.3:1 dark, 4.6:1 light). On its own 12% tint the light theme drops to 4.0:1 (source pair, under AA for 14px). Always pair it with an up arrow or a + sign, never colour alone.',
  loss: 'Loss FILL: the 12% tint behind negative P&L pills and failed import rows (`.bg-loss`). Never text: words use `loss-foreground`.',
  'loss-foreground':
    'Loss TEXT and icons (`.text-loss`, `.text-destructive`) and drawdown markers, on `background`, `card` and the loss tint (5.3:1 or more in both themes). Always pair it with a down arrow or a minus sign.',
  warning:
    'Caution FILL: the query-error notice (10% fill, 40% border). Text and icons use `warning-foreground` (`.text-warning` is remapped).',
  'warning-foreground':
    'Caution TEXT and icons on `background`, `card` and the warning tint (12.9:1 dark, 5.0:1 light): alert icons and 7-30-day-old manual prices.',
  info: 'Informational FILL (`bg-info`) for neutral notices.',
  'info-foreground':
    'Informational TEXT and icons on `background` and `card` (9.5:1 dark, 7.9:1 light).',
  'accent-crypto':
    'Crypto section accent (blue) on Portfolio: header icon and tinted frame. Same in both themes: 4.8:1 dark, 3.4:1 light on `card`.',
  'accent-equities':
    'Equities section accent (amber). Same in both themes: 8.2:1 on dark `card`, but 2.0:1 on light `card` (source value, under 3:1 for an icon), so the section title text carries the meaning.',
  'accent-cash':
    'Cash section accent (green). Same in both themes: 7.6:1 dark, 2.1:1 light on `card` (under 3:1 in light, source value).',
  'accent-custody':
    'Held-for-others accent (purple): the custody section and its badges. Same in both themes: 4.4:1 dark, 3.7:1 light on `card`.',
  'accent-macro':
    'Macro accent (teal): the News macro lane icon, its 40% border and 5% tint. Same in both themes: 5.8:1 dark, 2.8:1 light on `card` (under 3:1 in light, source value).',
  ...CHART_USAGE,
};

function buildChartUsage() {
  const usage = {
    'chart-portfolio':
      "The portfolio's own area and line: a deliberately neutral slate, so benchmarks read as the comparison. 6.5:1 dark, 5.3:1 light on `card`.",
    'chart-portfolio-foreground':
      'Portfolio-coloured text (legend values, tooltips) on `card`: 8.7:1 dark, 9.0:1 light.',
    'chart-btc': 'BTC benchmark line (orange). 7.5:1 dark, 4.4:1 light on `card`.',
    'chart-btc-foreground':
      'BTC-coloured text in legends and tooltips on `card` (9.4:1 dark, 8.1:1 light).',
    'chart-eth': 'ETH benchmark line (periwinkle). 6.9:1 dark, 4.7:1 light on `card`.',
    'chart-eth-foreground':
      'ETH-coloured text in legends and tooltips on `card` (9.0:1 dark, 7.5:1 light).',
    'chart-benchmark-1': 'Third benchmark line (teal), after BTC and ETH: SPX or a custom pick.',
    'chart-benchmark-1-foreground':
      'Text in the `chart-benchmark-1` colour on `card` (9.1:1 dark, 7.8:1 light).',
    'chart-benchmark-2': 'Fourth benchmark line (coral).',
    'chart-benchmark-2-foreground':
      'Text in the `chart-benchmark-2` colour on `card` (8.4:1 dark, 8.1:1 light).',
    'chart-benchmark-3': 'Fifth benchmark line (purple).',
    'chart-benchmark-3-foreground':
      'Text in the `chart-benchmark-3` colour on `card` (8.8:1 dark, 7.8:1 light).',
    'chart-benchmark-4': 'Sixth benchmark line (amber). 7.9:1 dark, 3.6:1 light on `card`.',
    'chart-benchmark-4-foreground':
      'Text in the `chart-benchmark-4` colour on `card` (9.8:1 dark, 7.7:1 light).',
  };
  const assetHues = [
    'raspberry',
    'blue',
    'green',
    'violet',
    'cyan',
    'ochre',
    'slate',
    'coral',
    'indigo',
    'olive',
  ];
  const assetExtra = {
    1: ' Also the Crypto bucket in the By Asset donut.',
    2: ' Also the Equities bucket in the By Asset donut.',
  };
  assetHues.forEach((hue, index) => {
    const n = index + 1;
    usage[`chart-asset-${n}`] =
      `Asset series ${n} (${hue}) in the Detailed allocation donut and per-asset lines, assigned in this order.${assetExtra[n] ?? ''} 4.6:1 or more on \`card\` in both themes.`;
  });
  ['green', 'azure', 'purple', 'raspberry', 'slate'].forEach((hue, index) => {
    usage[`chart-storage-${index + 1}`] =
      `By Storage donut, slice ${index + 1} (${hue}); later slices continue with asset series 6-10, then 1-5.`;
  });
  ['azure', 'green', 'raspberry', 'ochre', 'slate'].forEach((hue, index) => {
    const extra = index === 0 ? ' Also the Cash bucket in the By Asset donut.' : '';
    usage[`chart-cash-${index + 1}`] = `Cash Breakdown donut, slice ${index + 1} (${hue}).${extra}`;
  });
  return usage;
}

/** Colours that are not index.css variables: the logo's inks and the theme-invariant scrims. */
export const EXTRA_COLORS = [
  {
    name: 'mark-ground',
    value: '#0b0b18',
    usage:
      "The brand mark's square ground in `logo.svg` and the app icons. Identity only (logo, cover, icon tiles), never UI chrome.",
  },
  {
    name: 'mark-violet',
    value: '#665cf6',
    usage: "The mark's violet leaf. Identity only; the UI's indigo is `primary`.",
  },
  { name: 'mark-cream', value: '#f4f0e8', usage: "The mark's cream leaf. Identity only." },
  {
    name: 'scrim-dialog',
    value: 'rgb(0 0 0 / 0.6)',
    usage:
      'Dialog backdrop (`bg-black/60`), the same in both themes. Never a `foreground`-based scrim: it washes out dark mode.',
  },
  {
    name: 'scrim-nav',
    value: 'rgb(0 0 0 / 0.4)',
    usage: 'Mobile navigation drawer backdrop (`bg-black/40`), the same in both themes.',
  },
];

const style = (name, fontSize, lineHeight, fontWeight, sample, usage, letterSpacing) => ({
  name,
  fontSize,
  lineHeight,
  fontWeight,
  ...(letterSpacing ? { letterSpacing } : {}),
  sample,
  usage,
});

export const TYPE = {
  fonts: [],
  families: {
    sans: '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
    mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
  groups: [
    {
      name: 'Display',
      family: 'sans',
      note: 'Bold, tight, tabular. One hero figure per screen.',
      styles: [
        style(
          'display-hero',
          '54.4px',
          1.08,
          700,
          'Every asset you own.',
          'Landing hero headline only, at lg and up (48px at sm, 36px below).',
          '-0.025em'
        ),
        style(
          'display-section',
          '36px',
          '40px',
          700,
          'The full picture is waiting.',
          'Landing section headings (30px/36px below sm).',
          '-0.025em'
        ),
        style(
          'net-worth',
          '48px',
          1,
          700,
          '$1,284,310',
          'The dashboard Net Worth figure, with tabular numerals (36px/40px below sm).',
          '-0.025em'
        ),
        style(
          'total-value',
          '36px',
          1,
          700,
          '$642,155',
          'The Portfolio hero Total Value, with tabular numerals (32px below sm).',
          '-0.025em'
        ),
      ],
    },
    {
      name: 'Interface',
      family: 'sans',
      note: '14px is the working size. Weights 400, 500, 600 and 700 only.',
      styles: [
        style(
          'page-title',
          '24px',
          '32px',
          700,
          'Portfolio',
          'The one h1 per page, in the page header.'
        ),
        style(
          'section-title',
          '18px',
          '28px',
          600,
          'Snapshot schedule',
          'Settings sections, empty-state headings.'
        ),
        style('dialog-title', '18px', 1.375, 600, 'Add Position', 'Dialog titles.', '-0.025em'),
        style(
          'card-title',
          '16px',
          1,
          600,
          'Crypto',
          'Card and collapsible-section titles.',
          '-0.025em'
        ),
        style(
          'body',
          '14px',
          '20px',
          400,
          'Live prices, daily snapshots, honest benchmarks.',
          'Default UI text: table cells, descriptions, menu items.'
        ),
        style(
          'body-medium',
          '14px',
          '20px',
          500,
          'Refresh Prices',
          'Buttons, form labels, nav items, emphasised cells and metric values.'
        ),
        style(
          'body-lg',
          '16px',
          '24px',
          400,
          'The full picture, without the spreadsheet.',
          'Every text input below 640px (16px stops iOS zoom) and landing paragraphs, which use 1.625 leading.'
        ),
        style(
          'caption',
          '12px',
          '16px',
          400,
          'SGD Value: S$1,742,906',
          'Metadata, helper text, metric labels, timestamps; usually `muted-foreground`.'
        ),
        style(
          'label-caps',
          '12px',
          '16px',
          500,
          'OPEN TRADES',
          'Small uppercase labels above grouped data; set in uppercase.',
          '0.025em'
        ),
        style(
          'micro',
          '11px',
          '16px',
          400,
          '(Mar 12, 2026)',
          'Dates under metrics and native-currency price hints. Always full-opacity `muted-foreground`.'
        ),
      ],
    },
    {
      name: 'Numerals',
      family: 'mono',
      note: 'JetBrains Mono with tabular figures for prices, quantities and P&L in tables.',
      styles: [
        style(
          'mono-figure',
          '14px',
          '20px',
          500,
          '$64,210.55',
          'Prices, totals and P&L in table cells, right-aligned.'
        ),
        style(
          'mono-small',
          '12px',
          '16px',
          400,
          '0.45000000 BTC',
          'Quantities, sublabels and dense numeric metadata.'
        ),
        style(
          'eyebrow',
          '11px',
          '16px',
          400,
          'PRIVATE PORTFOLIO DASHBOARD',
          'Landing eyebrows above headlines; set in uppercase.',
          '0.2em'
        ),
      ],
    },
  ],
};

const token = (name, value, usage) => ({ name, value, usage });

/** Non-colour families, in display order. `focus-ring` is appended to `shadow` per theme. */
export const FAMILIES = {
  spacing: {
    note: "Tailwind's 4px scale; names match the utility keys (gap-1.5 is space-1.5). 2, 1, 3 and 4 do most of the work.",
    tokens: [
      token(
        'space-0.5',
        '2px',
        'Hairline nudges: chip padding-y, the gap between icon buttons in a cluster.'
      ),
      token(
        'space-1',
        '4px',
        'Menu and tab-list padding, icon-to-text gaps in metric labels, stacked list rows.'
      ),
      token('space-1.5', '6px', 'Card and dialog header stacks, menu item padding-y, chip gaps.'),
      token(
        'space-2',
        '8px',
        'The default gap: button groups, form rows, icon-to-label (`mr-2`), dialog footer.'
      ),
      token('space-2.5', '10px', 'Brand mark to wordmark.'),
      token(
        'space-3',
        '12px',
        'Page-header stack, sidebar link padding, input and trigger padding-x, toolbar gaps.'
      ),
      token(
        'space-4',
        '16px',
        'Mobile page gutter, dense card padding, popover padding, dialog padding below sm.'
      ),
      token('space-5', '20px', 'Gap between a page header and the panes it hosts.'),
      token(
        'space-6',
        '24px',
        'Card padding, desktop page gutter, dialog padding from sm, sidebar header padding-x. Also the landing dot-grid pitch.'
      ),
      token('space-8', '32px', 'Container padding, landing CTA offsets.'),
      token('space-12', '48px', 'Landing grid gaps.'),
      token(
        'space-16',
        '64px',
        'Landing hero top padding; empty states sit in 64px of vertical space.'
      ),
      token('space-20', '80px', 'Landing section padding below sm.'),
      token('space-28', '112px', 'Landing section padding from sm.'),
    ],
  },
  radius: {
    note: 'Small and soft: one 6px base (`--radius`) stepped down by 2px. Full rounding only for pills and round hit areas.',
    tokens: [
      token(
        'radius-sm',
        '2px',
        '`rounded-sm`: tab triggers, menu and select items, checkboxes, the dialog close button.'
      ),
      token(
        'radius-md',
        '4px',
        '`rounded-md`, the workhorse: buttons, inputs, select triggers, menus, popovers, tooltips, tab lists, notices, nav items, kbd chips.'
      ),
      token('radius-lg', '6px', '`rounded-lg` (the source `--radius`): cards and dialogs.'),
      token(
        'radius-full',
        '9999px',
        'Pills (P&L chips, badges), round hit areas (help tooltips, avatar), scrollbar thumbs.'
      ),
      token(
        'radius-mark',
        '22%',
        "The brand mark's corner (`rounded-[22%]`), wherever the logo tile appears."
      ),
    ],
  },
  shadow: {
    note: "Borders separate; shadows only lift what floats. Tailwind's defaults, unchanged.",
    tokens: [
      token('shadow-sm', '0 1px 2px 0 rgb(0 0 0 / 0.05)', 'Cards at rest, the active tab trigger.'),
      token(
        'shadow-md',
        '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        'Menus, select lists, popovers, tooltips.'
      ),
      token(
        'shadow-lg',
        '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
        'Dialogs, sub-menus, the mobile nav drawer.'
      ),
    ],
  },
  size: {
    note: 'Fixed dimensions the layout and touch rules depend on.',
    tokens: [
      token(
        'touch-target',
        '44px',
        'Minimum hit area on touch layouts (`h-11`/`min-h-11`): buttons, inputs, select and menu items, help tooltips, legend items.'
      ),
      token(
        'control-height',
        '40px',
        'Default button, input and select height from sm up (`sm:h-10`).'
      ),
      token(
        'control-height-sm',
        '36px',
        'Small buttons from sm up (`sm:h-9`); page-header actions use this size.'
      ),
      token(
        'header-height-mobile',
        '56px',
        'App header below sm (`h-14`); sticky page headers start under it.'
      ),
      token('header-height', '64px', 'App header and sidebar brand row from sm (`h-16`).'),
      token('sidebar-width', '256px', 'Expanded desktop sidebar (`lg:pl-64`).'),
      token('sidebar-rail', '72px', 'Collapsed desktop icon rail (`lg:pl-[4.5rem]`).'),
      token(
        'dialog-width',
        '512px',
        'Default dialog max width (`max-w-lg`); always `calc(100% - 2rem)` on small screens.'
      ),
      token(
        'metric-cell',
        '144px',
        'Net Worth metric rail cell on narrow containers (`auto-cols-[9rem]`).'
      ),
      token('tooltip-width', '240px', 'Help tooltip max width.'),
      token('container-max', '1400px', 'Centered container cap at 2xl.'),
    ],
  },
  opacity: {
    note: 'Alpha steps applied to colour tokens (`bg-primary/10`, `border-warning/40`).',
    tokens: [
      token('alpha-tint-soft', '0.05', 'Faint section frames (`bg-macro/5`).'),
      token(
        'alpha-tint',
        '0.1',
        'Selected and notice tints: active nav item, warning notice, highlight flash.'
      ),
      token('alpha-pnl', '0.12', 'P&L pill and import-row tints (`.bg-profit`, `.bg-loss`).'),
      token('alpha-edge', '0.3', 'Border of a selected item (`border-primary/30`).'),
      token('alpha-notice-edge', '0.4', 'Notice and section-frame borders (`border-warning/40`).'),
      token(
        'alpha-hover',
        '0.5',
        'Row and header hover (`hover:bg-muted/50`); also the disabled-control opacity.'
      ),
      token(
        'alpha-pressed',
        '0.9',
        'Primary and destructive button hover (`hover:bg-primary/90`).'
      ),
    ],
  },
  zIndex: {
    note: 'Stacking order. Select lists sit above dialogs so they never clip.',
    tokens: [
      token('z-sticky', '20', 'Sticky page headers (`PageActionHeader`).'),
      token('z-header', '30', 'The app header.'),
      token('z-nav-scrim', '40', 'Mobile nav backdrop.'),
      token('z-overlay', '50', 'Dialogs, menus, popovers, tooltips, the mobile nav drawer.'),
      token(
        'z-select',
        '60',
        'Select content, above dialogs. Never reuse the dialog layer for it.'
      ),
      token('z-skip-link', '100', 'The skip-to-content link when focused.'),
    ],
  },
};

export const FOCUS_RING_USAGE =
  'Keyboard focus on every control (`ring-2 ring-ring ring-offset-2`): a 2px `background` gap, then 2px of solid `ring`. Forced-colors mode swaps in a 2px Highlight outline.';

/** Where each catalogued component lives, recorded in tokens.json `meta` for re-syncs. */
export const COMPONENT_SOURCES = {
  Button: 'ui/button.tsx',
  Input: 'ui/input.tsx',
  Textarea: 'ui/textarea.tsx',
  Label: 'ui/label.tsx',
  Checkbox: 'ui/checkbox.tsx',
  FormattedNumberInput: 'ui/formatted-number-input.tsx',
  Select: 'ui/select.tsx',
  CreatableSelect: 'ui/creatable-select.tsx',
  Tabs: 'ui/tabs.tsx',
  DropdownMenu: 'ui/dropdown-menu.tsx',
  Dialog: 'ui/dialog.tsx',
  Popover: 'ui/popover.tsx',
  Tooltip: 'ui/tooltip.tsx',
  HelpTooltip: 'ui/HelpTooltip.tsx',
  Table: 'ui/table.tsx',
  SortableHeader: 'ui/SortableHeader.tsx',
  AssetLabel: 'ui/asset-label.tsx',
  PageActionHeader: 'layout/PageActionHeader.tsx',
  Card: 'ui/card.tsx',
  CollapsibleCard: 'portfolio/CollapsibleCard.tsx',
  Collapsible: 'ui/collapsible.tsx',
  Separator: 'ui/separator.tsx',
  Skeleton: 'ui/skeleton.tsx',
  QueryErrorNotice: 'ui/QueryErrorNotice.tsx',
  ImportResultsList: 'ui/ImportResultsList.tsx',
  AppToaster: 'layout/AppToaster.tsx',
};
