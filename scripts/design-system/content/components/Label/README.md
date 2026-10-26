# Label

Form label: 14px at weight 500 with no extra leading (Radix Label).

- **You provide:** the text and `htmlFor` pointing at the control's `id`.
- When the control before it carries the `peer` class and is disabled, the label dims to 70%.
- Checkbox rows in the app often use a plain `<label className="text-sm text-muted-foreground">` beside the box instead.

Source: `packages/frontend/src/components/ui/label.tsx`.
