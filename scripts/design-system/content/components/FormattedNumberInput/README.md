# FormattedNumberInput

Text input for money and quantities that shows thousands separators ("12,500.5") while state keeps the raw string ("12500.5").

- **You provide:** `value` (raw string) and `onValueChange(raw)`, plus any `Input` props except `type`, `value` and `onChange`.
- A leading minus is rejected unless `allowNegative` — it is never turned into a positive number.
- Gate submit on the app's `isPositiveNumberInput()` / `isNonNegativeNumberInput()` checks, not on `required` or `parseFloat`, so the form agrees with the server's validation.
- `inputMode` defaults to `decimal`, so phones show a number pad.
- `formatNumberInputValue` and `sanitizeNumberInput` are exported for the same formatting elsewhere.

Source: `packages/frontend/src/components/ui/formatted-number-input.tsx`.
