# Trade names and the default trade order

## Problem

A JSON import can supply the ticker as both `Asset.symbol` and `Asset.name`.
`AssetLabel` previously hid the name line when both values matched.
This made incomplete import metadata look like a layout inconsistency.

The trade API returns entry date, newest first. `useTableSort` previously kept
column choices only while the table remained mounted. Users could not select
a saved default or distinguish opening chronology from closing chronology.

## Repair

Verify incomplete names against the exchange contract and project sources.
Correct only the identified catalog names. Preserve provider identity and trade
fields. A ticker alone does not establish token identity.

Trade tables and trade review rows pass `alwaysShowName` to `AssetLabel`.
The full name remains visible even when its legitimate name matches its ticker.
Other lists retain their existing name-display behavior.

`lib/tradeSort.ts` defines six chronological defaults:

- Entry date: newest or oldest first.
- Exit date: newest or oldest first.
- Date logged: newest or oldest first.

The comparison uses the full timestamp. Missing or invalid dates stay last in
either direction. Asset-independent trade IDs break equal-timestamp ties.
Date logged uses `Trade.createdAt`, not the last edit time.

`tradeSortStore.ts` saves one validated preference under
`foliobuddy-trade-default-sort`. Settings and the Review and Ticker tables use
the same control. The preference applies to this browser. It defaults to entry
date, newest first.

Column headers provide temporary sorting. Clearing that sort returns to the
saved default. Selecting a different default clears the temporary sort.
Monthly review rankings keep their existing analytical order.

The API already returns `createdAt`. The shared type now describes that field
as optional for older clipboard and demo records. Demo imports assign it once
and preserve it during edits.

## Name evidence

The imported contracts resolve to these names:

| Contract    | Name             | Primary source                                                                                                           |
| ----------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| LITUSDT     | Lighter Protocol | [Binance contract announcement](https://www.binance.com/en/support/announcement/detail/6a33be00231c4539b3a4a625538e4d1e) |
| NEARUSDT    | NEAR Protocol    | [NEAR Protocol economics](https://www.near.org/blog/near-protocol-economics)                                             |
| EDENUSDT    | OpenEden         | [Binance official announcement](https://www.binance.com/en/square/post/30380551860617)                                   |
| USELESSUSDT | Useless Coin     | [Binance contract announcement](https://www.binance.com/en/support/announcement/detail/76c269080e8247fea630b60c7449532e) |
| VVVUSDT     | Venice Token     | [Venice token page](https://venice.ai/token)                                                                             |

The private repair record contains the exact asset IDs, before-state, and result.
Transaction guards verified that only names changed and linked trades stayed
unchanged. Do not commit account records or the private repair record.

## Verification

- Sort tests cover opening, closing, and logged chronology, including full timestamps.
- Missing exit dates stay last for both directions.
- Store tests cover reload persistence and invalid saved preferences.
- Table tests cover the active indicator, temporary overrides, and default changes.
- Demo tests verify that edits preserve the date logged.
- Browser checks use the standard sandbox and sample data.
- Production readback verifies the corrected names independently of the code rollout.

The frontend suite passed all 487 tests. Backend, frontend, and shared builds
passed. Formatting, shell checks, and domain parity passed. Changed-file ESLint
reported no errors. Its two existing demo Fast Refresh warnings remain.

The real sandbox UI passed desktop, 768px tablet, and 390px mobile inspection.
Keyboard selection in Settings updated the table. A reload preserved the order.
Both closing-date directions kept open trades last. The three-click header
cycle returned to the selected default. The Ticker table shared the preference,
and visiting Monthly did not reset it. The browser viewport was restored.

Sparkleup selected the existing controls and visual rules without adding a
design dependency. The React best-practices pass checked state ownership,
derived sorting, accessible labels, stable keys, and the saved preference schema.

Publish the frontend change through the normal approved release process.
The live name repair does not deploy the new sorting control.
