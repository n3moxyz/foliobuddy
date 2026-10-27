# AssetLabel

Asset identity for lists: the complete ticker on top, a readable short name beneath, and an optional type badge.

- **You provide:** `asset` ({ symbol, name, category }), and optionally `badge` (such as the amber "UT" unit-trust chip), `nameOverride`, `alwaysShowName` and `className`.
- Names shorten for summaries only: "DBS Group Holdings Ltd" becomes "DBS", and cash and stablecoins read "Cash" (`assetDisplayName`, exported). Forms, details, matching and exports keep the full name.
- Tickers and names wrap anywhere instead of truncating. Never cut a ticker.
- The name line hides itself when it equals the ticker.

Source: `packages/frontend/src/components/ui/asset-label.tsx`.
