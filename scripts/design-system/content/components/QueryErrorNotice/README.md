# QueryErrorNotice

Warning notice for a failed load or refresh, with a "Try again" button.

- **You provide:** `subject` ("positions"), `onRetry`, and optionally `hasData` (stale data is still on screen) and `retrying`.
- The copy is fixed: "Couldn't load positions" or "Couldn't refresh prices", then "Check your connection and try again." — prefixed with "Showing the last loaded data." when `hasData` is true.
- Keep loaded data visible beneath it. Show an empty state only after a successful empty response.
- It uses a 10% `warning` tint, a 40% `warning` border and an `AlertCircle` in `warning-foreground`.

Source: `packages/frontend/src/components/ui/QueryErrorNotice.tsx`.
