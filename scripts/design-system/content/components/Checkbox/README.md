# Checkbox

Radix checkbox: a 16px box with a `primary` border that fills `primary` and shows a check when on; an invisible 14px halo makes its hit area 44px.

- **You provide:** `checked` / `defaultChecked`, `onCheckedChange(checked)`, `id`, `name`, `disabled`.
- Put the label to the right: `flex items-center space-x-2`, label `text-sm text-muted-foreground`.
- Use it for independent yes/no settings ("Don't ask me again", "Held for someone else"). For one choice of many use `Select` or `Tabs`.

Source: `packages/frontend/src/components/ui/checkbox.tsx`.
