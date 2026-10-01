# IBKR currency cash, borrowing and daily sync

IBKR reports separate native-currency balances and a BASE aggregate. A positive USD
settlement balance does not represent the account when another currency is borrowed.
The app keeps one owned USD cash position at `BROKERAGE / IBKR`. Its signed quantity
and value are the net USD cash amount; `ibkrCash` retains every native balance, its
FX, capture time and source. BASE is a total and never an additional balance.
IBKR defines ledger FX relative to the account's base currency; see its
[ledger reference](https://www.interactivebrokers.com/docs/web-api/api-reference/trading/trading-portfolio/get-portfolio-ledger).

Only IBKR fiat cash shows this panel. Tiger, Binance, bank cash and custody forms
keep their existing controls. Manual entries choose Cash or Debt explicitly and
require real stored FX less than 48 hours old. A managed cash aggregate cannot
fund an ordinary single-currency position change, be imported as a flat cash row,
or be deleted through the generic route. Allocation pies use positive assets and
explain that net IBKR debt is deducted separately from net worth.

## Preview, apply and restore

Deploy the additive migration and backend before using the frontend. New endpoints
are protected by the existing Clerk owner session, not the read-only agent key.

1. Open the owned IBKR cash position. If absent, select Cash (fiat) at IBKR in Add
   Position and choose **Open IBKR currency balances**. This creates a zero-value
   anchor, never a fabricated deposit or fill. Multiple existing cash rows require
   review rather than automatic consolidation.
2. Choose **Edit currency balances** for a manual correction or **Import broker
   capture** for a complete broker capture. Preview performs no writes.
3. Review quantity, native average and net cash changes, including each currency.
   Download and verify the private checkpoint before applying. Complete Chrome's
   native Save dialog when enabled; a button click alone does not confirm the file.
4. Apply requires the same before/after state hash. A Serializable transaction
   updates the holdings and cash, verifies readback, then saves an owner-scoped
   `IbkrSyncRun` containing source and before/after checkpoints. A failed check
   rolls back every write. The same source capture applies only once.
5. Reload and verify the saved quantities, native averages, currency balances and
   source timestamp. Original USD purchase records and all trade history remain.
6. **Recent checkpoints → Restore → Check restoration** shows the exact reversal.
   Restore succeeds only when current IBKR financial records and history still
   equal that checkpoint's saved result. Later edits or syncs require review.

## On-demand sync

The owned IBKR group and its cash panel offer **Sync IBKR**. After a one-time Mac
helper setup, one click reads, validates, backs up, applies and independently
verifies the complete capture. No chat prompt or Send step is needed. See the
[one-click sync runbook](2026-10-01-ibkr-one-click-sync.md) for setup, pairing,
security boundaries, audit files and failure handling.

**Import broker capture** remains the manual JSON path. Manual cash snapshots show
**Last manual cash edit**; `ibkrSyncedAt` also changes on manual edits and cannot
alone identify a broker capture. The daily agent procedure below is unchanged.

## Daily agent procedure

Use a thread heartbeat at 06:00 Asia/Singapore. Enable it only after a successful
production rehearsal. It uses the IBKR plugin for reads and the existing signed-in
FolioBuddy browser session for owner-authorized app edits. Expired authentication,
missing browser access or unavailable plugins stop the run and require attention.

- Read account positions, currency balances and summary twice. Record the actual
  receipt time after each complete sample; do not refresh timestamps on old data.
  Both samples must be within three minutes and the entire capture within fifteen
  minutes. Abort on an error or inconsistent quantities, averages or native cash.
- Build `{ version: 1, first, second, executions }`. Each sample contains
  `capturedAt`, the original `positions` and `balances` arrays, and `summary` with
  `currency`, `total_cash_value`, `gross_position_value`, `net_liquidation`.
  Preserve numeric precision. No BASE-to-USD or currency conversion guesses.
- Read recent broker executions. Map verified `trade_id`, `symbol`, `currency`,
  `side`, `size`, and an unambiguously parsed `trade_time` to execution
  `id`, `symbol`, `currency`, `side`, `quantity`, `date` (ISO UTC). Missing or
  ambiguous dates cannot certify a closing sale. A missed interval beyond the
  available executions must stop full-close reconciliation for review.
- The latest second sample's reported BASE cash is authoritative. Store it and
  every native balance exactly as returned; never adjust source FX or a native
  amount to force currency conversions to equal BASE. For non-USD accounts,
  convert BASE to USD using that sample's reported USD-to-base rate.
- Native cash and currency identities must be unchanged across reads. Currency
  FX, BASE and summary refresh separately, so the arithmetic cross-check allows
  1% of **gross absolute foreign-currency cash exposure**, plus the larger of
  0.10 base-currency units or the reported-rate rounding budget (absolute foreign
  native amounts × 0.000000005). This is a bounded sanity check, not an adjustment
  to the saved total or proof of completeness by itself. Base-currency cash gets
  no FX allowance; offsetting cash/debt cannot shrink it to a near-zero net value.
  Summary cash may extend beyond the two observed BASE values by the same
  allowance. Larger unexplained discrepancies still stop the sync. Currency and
  contract uniqueness, required holding currencies, stable native amounts,
  securities totals/subtotals, supported instruments and ownership checks remain
  mandatory. BASE and any native base-currency row must have an exchange rate of 1.
- Match holdings by verified exchange ticker/native currency and then retain their
  IBKR contract IDs. Unknown or duplicate matches require the owner to add or
  resolve the asset. A missing holding reaches zero only with complete closing-sale
  evidence after its prior sync; retain its row and history. An unexpectedly empty
  portfolio requires review. Never guess a replacement asset or delete history.
- Save receipts, capture, checkpoint and readback privately in
  `.local/ibkr-sync/YYYY-MM-DD/` (directory `0700`, files `0600`, ignored by Git).
  Never send portfolio data to GitHub, automation prompts or external messages.
- Preview in the IBKR cash panel, verify the downloaded checkpoint, apply and
  independently read back the app. Notify only on changed quantity, native average
  or native cash balance, or actionable failures. FX-only changes and unchanged
  successful runs stay quiet. Never trade, transfer, change broker settings or
  broaden authentication as part of this task.

Broker snapshots reconcile current holdings; they do not fabricate buys or sells.
The detailed historical native-cost repair remains a separate evidence-based flow.
Main USD basis uses dated app FX; quote or refresh timing can cause small display
differences from a simultaneously open broker screen.

## Verification

`scripts/verify-ibkr-sync.ts` runs on an isolated local test database with fictional
data. It checks source completeness, borrowing, partial-write rollback, ownership,
USD/history preservation, idempotency, FX-only quiet behavior, closing evidence and
exact restore. CI also runs the native-cost Postgres verifier and project tests.
`npm run sandbox -- --reset` seeds a real fictional IBKR cash/debt account. The
mocked demo supports cash preview/apply/restore and explicitly refuses complex
broker captures; use the real sandbox for that validation.
