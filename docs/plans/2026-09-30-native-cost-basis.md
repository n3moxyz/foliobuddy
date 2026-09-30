# Native weighted-average cost reconciliation

## Problem and chosen behavior

The portfolio stores only historical USD costs. Native cost labels and edit forms
currently translate those dollars at today's FX, so they look like original local
purchase prices even though they are not. The owner has selected native weighted
average as the primary basis, translated at current FX for USD cost and P&L.

A sale removes shares at the existing native average. Sale proceeds never change
that average. New purchases change it by quantity-weighted average. This matches
the observed IBKR portfolio average; the statement's remaining FIFO lots are a
different measure. Statement charges can also differ from the portfolio feed's
commission treatment.

## Alternatives considered

- Replacing historical USD costs at today's FX would lose the original records and
  require repeated corrections whenever FX moves. Rejected.
- Switching the app to FIFO would conflict with the owner's explicit preference.
  Rejected.
- Preserve the USD ledger and add an authoritative native basis, projecting its
  current USD equivalent on reads. Selected. Older rows remain USD-only until a
  verified native baseline is supplied; no inferred historical FX is backfilled.

## Implementation

1. Add nullable native cost fields to positions and history with an additive
   migration. Preserve stored USD averages and every existing history row.
2. Project native averages through real, dated FX rates for portfolio reads,
   performers, agent reads and exports. Expose the recorded USD average separately
   so deltas and clipboard round trips preserve it.
3. Save native inputs and the actual conversion rate used for new entries. Compute
   weighted average independently in native currency and the retained USD ledger.
   Reductions preserve both averages, and cancellation restores both atomically.
4. Native edit forms use saved native amounts. History shows saved native prices;
   legacy history never presents a current-FX approximation as an original price.
5. Prepare a reconciliation script that defaults to dry run, requires one exact
   owned broker position per symbol, checks existing quantities and USD costs,
   writes a private rollback bundle before an atomic update, and can restore that
   bundle with a check that records have not changed in the meantime.
6. Use the signed-in app for the same repair when direct production database
   access is unavailable. Preview returns a private, versioned backup and a hash
   of the reviewed records. Apply rechecks that exact state inside a Serializable
   transaction. Restore checks every original and reconstructed history row and
   refuses subsequent edits. The app preserves original USD records in both paths.

## Evidence and live-operation gates

- Refresh current quantities and portfolio averages from IBKR before editing.
  Any included execution ledger must agree with those share quantities.
- Native purchase and sale records come from Activity Statements and the execution
  feed. Historical app FX was not stored: keep it unknown,
  and preserve historical USD values instead of inventing exchange rates.
- Private account evidence, exact amounts and rollback files stay outside Git.
- Validate FX changes, weighted purchases and partial sales, stale/missing FX,
  cancellation, ownership, concurrency, clipboard/import and rendered forms.
- Deploy the additive migration/backend before the frontend. Verify the exact
  deployed revision, then dry-run against the live user's actual records.
- Apply only after the dry run matches the reviewed source, a readable backup is
  saved, and production access is available. Read back both the data and rendered
  app. A successful local build is not a deployed or reconciled portfolio.
- Existing full-close behavior still deletes a position and its cascading history;
  the current repair neither closes positions nor changes that separate contract.
- Cash requires its own final broker snapshot: current foreign balances can be
  negative and today's FX conversions are still changing them. Do not fold a debt
  into an invented positive USD cash amount or apply an old cash snapshot.

## Acceptance

Native averages agree with the chosen broker portfolio measure. Changing FX changes
the main USD equivalent, not the native average or historical USD records. Sales
leave average cost unchanged. Native amounts and conversion provenance survive
edits, cancellation, imports and exports. No live position is rewritten until the
support is deployed, the exact repair is validated and its rollback is reviewable.
