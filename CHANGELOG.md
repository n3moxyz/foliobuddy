# Changelog

## v1.69.0

- Reorder Portfolio subgroups by dragging them or using the move buttons. FolioBuddy remembers the order in the current browser.
- Restore the full scroll position when returning to a taller page with Back in iOS Safari.

## v1.68.2

- Keep Portfolio scrolling when a swipe starts on a menu button. Let menus scroll on short screens.
- Keep the current page visible while the next page loads. Restore scroll position on Back.
- Keep the Portfolio summary steady during loading and render only the active holdings layout.

## v1.68.1

- Swipe up to dismiss an IBKR sync toast on mobile, or close it on desktop. The sync keeps running and shows a temporary result.
- Ease the mobile navigation drawer in from the side and give bottom sheets their own vertical motion.

## v1.68.0

- Start an IBKR sync from your phone through a connected Mac and follow the verified result in a toast.

## v1.67.3

- Keep the IBKR toast visible during sync and automatically dismiss it after showing the result.

## v1.67.2

- Show IBKR sync progress and its result in a persistent toast so you can keep using FolioBuddy.
- Sync successfully when IBKR includes closed positions with zero shares and the sales can be verified.

## v1.67.1

- Show the release version, frontend build ID and changelog link in Settings → About.
- Track the release version in the root package manifest and tag the deployed commit.

## Historical releases

The [production deployment history](docs/DEPLOYMENT-HISTORY.md) records the reconstructed versions from v1.0.0 to v1.67.0.

| Version | Change |
| --- | --- |
| v1.67.0 | Open a full position reduction from the row action |
| v1.66.0 | Add an interactive net worth demo to the landing page |
| v1.65.0 | Save editable position reduction presets per account |
| v1.59.0 | Add daily IBKR sync on a Mac |
| v1.47.0 | Add the portfolio News tab |
| v1.15.0 | Add equities to Portfolio |
| v1.0.0 | First recorded production deployment |
