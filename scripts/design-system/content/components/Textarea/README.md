# Textarea

Multi-line text field for notes and JSON imports, at least 80px tall, with 16px text below 640px.

- **You provide:** any `<textarea>` attributes and a `Label` or `aria-label`.
- **JSON import boxes** use `font-mono text-base sm:text-xs` and 6 rows, with a placeholder that shows the exact import format — the same JSON that Copy All produces.
- Parse as the user types and report problems inline with `role="alert"`, `aria-invalid` and `aria-describedby`.

Source: `packages/frontend/src/components/ui/textarea.tsx`.
