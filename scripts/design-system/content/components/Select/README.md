# Select

Radix select for fixed choices (category, storage type, currency, direction, theme): a 44px trigger (40px from 640px) and a list that floats above dialogs.

- **Parts:** `Select` (root: `value`, `defaultValue`, `onValueChange`, `open`), `SelectTrigger` with `SelectValue` inside, `SelectContent`, `SelectItem` (`value`), `SelectGroup`, `SelectLabel`, `SelectSeparator`.
- Items are 44px tall on touch layouts and show a check beside the selected one.
- The list sizes to its content (at most 24rem tall) and sits on `z-select` (60). Never force it to the trigger's height or drop it to the dialog layer — it opens but gets clipped.
- Free-text locations (exchange, wallet, broker, bank) use `CreatableSelect` instead.

Source: `packages/frontend/src/components/ui/select.tsx`.
