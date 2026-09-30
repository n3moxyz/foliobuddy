# Native weighted-average costs and broker reconciliation

## Cause

Older positions retained only USD costs. Forms and local-price history labels
translated those dollars using today's FX, which made the labels look like the
original purchase inputs. Partial sales preserved the USD average but could not
preserve an original native average that had never been saved.

## Cost contract

For a position with `avgCostNative` and `costCurrency`, native weighted average is
the primary basis. A purchase weights its native amount with the existing native
total. A partial sale removes shares at that average, independent of proceeds.
The main USD average and position P&L use the latest valid stored USD/native FX
rate. Responses include the conversion timestamp; rates more than 48 hours old
cause an explicit error. Different quote feeds or refresh times can still produce
small USD differences from a broker screen.

The original `avgCostUsd` and existing USD history fields remain a separate
recorded ledger. Responses expose that average as `recordedAvgCostUsd`, and delta
edits, clipboard copies and imports use it. History displays a native price only
when one was saved or reconstructed from verified broker orders. Historical app
FX was not stored, so old entries retain `fxRateToUsd: null`.

New foreign-currency equities and unit trusts save their native input at creation.
Matched unit-trust statements supply their native basis during a reset; an already
tracked fund retains its old USD ledger instead of replacing it at today's FX.

IBKR's portfolio average and the remaining statement tax lots are different
measures after sales. The repair targets the selected portfolio average. Orders
have separate `portfolioFees` and full `statementFees`; the latter can include
taxes absent from the portfolio feed. History retains gross execution prices,
statement charges and broker IDs, while its native basis follows the chosen
portfolio measure. Preserve the statement evidence separately.

## Signed-in repair

Deploy the additive migration and backend before the frontend. Validate the exact
revision and production health before changing records.

Native create/edit/import requests first check `/positions/native-cost-capabilities`.
This prevents an earlier backend from silently discarding native fields if the
frontend becomes available first during a deployment. Legacy-only writes keep
their existing path.

1. Capture current IBKR quantities and native portfolio averages. Keep the private
   JSON outside Git. `capturedAt` must be within 24 hours for preview/apply.
2. In Portfolio's overflow menu choose **Reconcile IBKR costs**. Load the capture
   and choose **Preview changes**. No writes occur.
3. Check every quantity, native average, retained USD average, dated current USD
   equivalent and history count. Each symbol must match exactly one owned IBKR
   brokerage position. Existing native baselines refuse a second repair.
4. Download the private backup and verify it exists and is readable before
   selecting **I saved the backup file**. Backups contain private portfolio data.
5. Apply the reviewed changes. The server rechecks the hash and every protected
   field inside a Serializable transaction. All positions succeed together; a
   failed check aborts the transaction. Readback is verified before commit.
6. Reload the portfolio and inspect native costs, main USD costs and the corrected
   histories. Independently reread IBKR if any position changed during review.

To undo, select **Restore backup**, load the downloaded version-2 backup, preview,
then restore. The server requires the same owner and exact repaired state, restores
only native fields and removes only the reconstructed initial rows. Original USD
fields and original history remain intact. Later edits, buys, sales or identity
changes stop restoration and require individual review.

If a timeout makes an apply outcome uncertain, keep the backup and reread the
portfolio. Do not force a rerun; an existing native baseline makes it refuse.

## Capture shape

Amounts below are fictional. Orders are optional when only a verified current
baseline is available; omitting them leaves historical entries untouched.

```json
{
  "capturedAt": "2026-09-30T08:00:00Z",
  "positions": [{
    "symbol": "TEST.KS", "quantity": 10, "recordedAvgCostUsd": 1,
    "currency": "KRW", "avgCostNative": 100.1,
    "orders": [{
      "orderId": "fictional-order", "timestamp": "2026-06-23T02:00:00Z",
      "side": "BUY", "quantity": 10, "price": 100,
      "portfolioFees": 1, "statementFees": 1.09
    }]
  }]
}
```

Included orders must reproduce current shares and native average. Histories must
match the order count (allowing one omitted original buy), directions, quantities,
Singapore trade dates and uninterrupted USD totals. Resets, missing orders,
different instruments and ambiguous matches stop the repair. The initial buy
reconstruction retains the original USD baseline, while native values and date
come from broker evidence. It never supplies an invented historical app FX rate.

## Maintainer CLI

`packages/backend/scripts/reconcile-native-costs.ts` offers a separate direct-DB
route, defaulting to dry run. Configure `DATABASE_URL` and `RECONCILE_USER_ID`
privately in `.env.local`, then run from the backend:

```bash
npx tsx scripts/reconcile-native-costs.ts --input /private/tmp/broker-capture.json
npx tsx scripts/reconcile-native-costs.ts --input /private/tmp/broker-capture.json --apply --backup /private/tmp/unique-native-backup.json
npx tsx scripts/reconcile-native-costs.ts --restore /private/tmp/unique-native-backup.json
npx tsx scripts/reconcile-native-costs.ts --restore /private/tmp/unique-native-backup.json --apply
```

The CLI and signed-in UI use the same service and version-2 backup format. Both
use native-only patches, verify readback inside the transaction, and reject
subsequent record changes. CLI backups use exclusive creation and mode `0600`,
with a successful file readback required before writes.

## Verification and limits

CI applies the real migration to Postgres and runs
`scripts/verify-native-cost-reconciliation.ts` on a dedicated local test database.
It covers unchanged USD records, current FX projection, actual apply/restore
transactions, full restored history, ownership, concurrency and database checks
for paired finite native costs. Route and frontend tests cover partial sales,
undo, captured FX, precision, copy/import and mock baseline repairs. Use
`npm run sandbox` for the complete real-app flow; the mocked demo deliberately
does not validate detailed broker ledgers.

Cash reconciliation needs a separate fresh broker snapshot and support for signed
foreign balances. This equity repair never invents a positive cash amount to
offset debt. Existing full-position closes still cascade-delete their history;
the repair preserves the current histories without changing that close behavior.

Historical snapshots are unchanged. Portfolio summary P&L remains its existing
YTD measure; per-position P&L uses the new native basis.
