# Design system artifact

This folder builds the files of the **FolioBuddy Design System** artifact on claude.ai: the tokens, the brand book, component guidelines, live previews and a bundle of the real UI components.

## Commands

| Command                       | What it does                                                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run design-system`       | Builds every file into `scripts/design-system/dist/project/` (git-ignored).                                                                                                          |
| `npm run design-system:check` | Renders each preview in both themes, then prints the contrast of the colour pairs the token notes quote. It fails on a script error, an empty render, or a preview that takes focus. |
| `npm run test:design-system`  | Unit tests for token extraction and the contrast maths. `npm test` runs them too.                                                                                                    |

The check uses Playwright's Chromium (`npx playwright install chromium`). Without it, the check uses your installed Google Chrome.

## Where each part comes from

| Output                                                                            | Source                                                                                                                             |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `tokens.json` colours                                                             | `packages/frontend/src/index.css`: `:root` is light, `.dark` is dark. Dark comes first because the app defaults to dark.           |
| `tokens.json` usage notes, type, spacing, radii, shadows, sizes, opacity, z-index | `tokens.config.mjs`                                                                                                                |
| `components/bundle.js`                                                            | The components that `bundle/exports.ts` re-exports, bundled as `window.FolioBuddy`. The host page supplies React 18.               |
| `components/bundle.css`                                                           | Tailwind with `bundle/tailwind.config.cjs`: the app's theme, with colours, radii, shadows and fonts read from the token variables. |
| Everything else: brand book, guidelines, previews, cover, type definitions        | `content/`, copied unchanged                                                                                                       |

The build stops when `index.css` gains a colour without a usage note, or when a note outlives its variable. The contrast figures inside the notes are hand-written. When a colour changes, run the check and update the notes it affects.

## Make a change

- **Change a colour:** edit `index.css` as usual. Rebuild, then copy the new figures from the check's contrast table into the note.
- **Change a component's code:** rebuild. Nothing here changes.
- **Add a component:**
  1. Export it in `bundle/exports.ts`.
  2. Add it to `COMPONENT_SOURCES` in `tokens.config.mjs`. That order is the catalogue order.
  3. Add `content/components/<Name>/README.md`. Its first sentence becomes the summary.
  4. Add `content/components/<Name>/preview.html`. Line 1 is `<!-- @dsCard group="…" height=N -->`. Never open an overlay with focus: pass `onOpenAutoFocus: (e) => e.preventDefault()`.
- **Change brand rules:** edit `content/README.md`.
- **Change the logo or app icons:** they live in `packages/frontend/public/`. The artifact stores them as uploaded assets, so upload them again after a change.

## Publish

The artifact keeps state that this build never writes: its index (`project/design-system.json`, with the asset records and the last-change stamp) and the uploaded logo and icons. The artifact page also generates `tokens.css`, `manifest.json` and the `api/` cards. So publish through Claude Code, not by copying files:

1. Run `npm run design-system && npm run design-system:check`.
2. Ask Claude Code: "Re-sync the FolioBuddy design system artifact from scripts/design-system/dist."

Claude reads the live index first. Then it publishes only the changed files under `project/`, keeps every asset record, and updates `lastChange`. Never publish `tokens.css` or `manifest.json`: the page writes them.
