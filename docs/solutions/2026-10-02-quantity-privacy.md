# Quantity privacy and visible current prices

The eye toggle originally hid monetary values but left most quantities visible.
Cash and stablecoin quantities reveal the balance directly; an asset quantity
combined with its public price also reveals the holding's value.

Use the reactive `useMoneyFormatter().formatQuantity()` for read-only holdings
and trades, including mobile rows, detail dialogs, history, imports, broker sync
results and position previews. Existing custom number formatting can instead
pass its result through `maskMoney()`. Keep editable inputs and intentional
clipboard/export payloads unchanged.

Current market quotes and published fund NAVs remain visible. Use the pure
`lib/utils.ts` currency/price formatter and omit `valuesHidden` from their
`localPriceLabel()` calls. Average costs, execution prices and account totals
still use the privacy formatter; their native labels still receive `valuesHidden`.

Regression coverage exercises reactive toggling, cash/crypto/equity/unit-trust
rows, mobile metadata, detail and history quantities, native quotes/costs,
snapshot holdings, broker sync summaries and editable position inputs.
