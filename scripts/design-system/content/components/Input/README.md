# Input

Single-line text field: 44px tall with 16px text below 640px (so iOS never zooms), 40px with 14px text from 640px up.

- **You provide:** any `<input>` attributes. Pair every field with a `Label` (`htmlFor` → `id`) or an `aria-label`.
- **Validation:** report errors inline under the field — `<p role="alert" className="text-sm text-destructive">` linked from the input by `aria-describedby`, with `aria-invalid` on the input. The field keeps its `input` border.
- **Placeholders** give an example, not an instruction: "Search BTC, AAPL, D05.SI…".
- For money and quantities use `FormattedNumberInput`, never `type="number"`.
- Disabled fields drop to 50% opacity with a not-allowed cursor.

Source: `packages/frontend/src/components/ui/input.tsx`.
