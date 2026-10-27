# CreatableSelect

Select with a "+ Add new …" row for free-text storage locations (exchange, wallet, broker, bank), with rename and remove for custom options.

- **You own the state:** `value`, `options`, `adding`, `inputValue`, and the handlers `onValueChange`, `onStartAdding`, `onInputChange`, `onAdd` (return the created option, or null to refuse) and `onCancel`.
- **Optional management:** `onEditOption(current, next)`, `onDeleteOption(option)` (return false to veto), `onClearValue`, and `isOptionEditable(option)` to protect the defaults.
- The pencil and trash buttons inside the list are pointer-only. The Rename / Remove row under the trigger is the keyboard path — keep both.
- Removing an option removes only the option. Records that use it keep their value.
- **Copy:** `addLabel` "+ Add new broker", `inputPlaceholder` "Enter broker name...", `inputLabel` "New broker name".
- Never use it for fixed lists (category, currency, direction): those are `Select`.

Source: `packages/frontend/src/components/ui/creatable-select.tsx`.
