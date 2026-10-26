# PageActionHeader

Header for busy pages: the `page-title` h1, an optional muted subtitle and a right-aligned row of actions, pinned under the app header while the page scrolls.

- **You provide:** `title`, `subtitle`, `actions` (`sm` buttons) and optional `children` — hero stats, lens tabs or counts, shown 20px below. `stickyOnMobile` defaults to true; Portfolio and News pass false.
- Make it the first child of the page's padded container. It bleeds to the edges with negative margins and draws a hairline under a 95% blurred `background`.
- Visible actions are non-destructive (Copy All, Add Position). "Delete All" goes in a ⋮ menu.
- It measures itself and sets `--app-scroll-offset`, so focused fields scroll clear of it.
- The Dashboard uses a plain header that scrolls away.

Source: `packages/frontend/src/components/layout/PageActionHeader.tsx`.
