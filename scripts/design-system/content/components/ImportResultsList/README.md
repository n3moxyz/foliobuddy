# ImportResultsList

Result view after a JSON import: a summary icon and count, one tinted row per item, and a "Close Import" button.

- **You provide:** `results` ([{ success, label, error }]) and `onDone`.
- Successes sit on the 12% `profit` tint with `CheckCircle2`. Failures sit on the 12% `loss` tint with `AlertCircle` and a user-safe message — never raw database errors.
- The Portfolio, Trades and History import tabs all use it.

Source: `packages/frontend/src/components/ui/ImportResultsList.tsx`.
