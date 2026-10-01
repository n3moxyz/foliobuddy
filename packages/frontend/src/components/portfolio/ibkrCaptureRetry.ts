/** Only these read-only preview failures may start a completely new capture. */
export function isIbkrFxTimingError(error: unknown) {
  return (
    error instanceof Error &&
    [
      'IBKR currency cash does not tally with BASE; incomplete capture',
      'IBKR cash summary differs from its currency balances',
    ].includes(error.message)
  );
}

type Sample = {
  capturedAt: string;
  summary: { currency: string };
  positions: Array<{
    contract_id: number;
    contract_description: string;
    currency: string;
    position: number;
    average_price: number;
    asset_class: string;
  }>;
  balances: Array<{ currency: string; cash_balance: number }>;
};

/** Exclude quoted FX/market values, but never conceal a changed holding or cash amount. */
export function ibkrRetryBaseline(raw: unknown) {
  const capture = raw as { first: Sample; second: Sample };
  const fingerprint = (sample: Sample) => {
    if (!sample.positions.length || !sample.balances.length || !sample.summary.currency)
      throw new Error('IBKR returned an incomplete capture.');
    return JSON.stringify({
      currency: sample.summary.currency,
      positions: [...sample.positions]
        .sort((a, b) => a.contract_id - b.contract_id)
        .map((p) => [
          p.contract_id,
          p.contract_description,
          p.currency,
          p.position,
          p.average_price,
          p.asset_class,
        ]),
      cash: sample.balances
        .filter((b) => b.currency !== 'BASE')
        .map((b) => [b.currency, b.cash_balance])
        .sort(([a], [b]) => String(a).localeCompare(String(b))),
    });
  };
  const firstTime = Date.parse(capture.first.capturedAt);
  const secondTime = Date.parse(capture.second.capturedAt);
  const nativeState = fingerprint(capture.first);
  if (
    !Number.isFinite(firstTime) ||
    !Number.isFinite(secondTime) ||
    firstTime > secondTime ||
    nativeState !== fingerprint(capture.second)
  )
    throw new Error('IBKR holdings or native cash changed during the sync. Start a new sync.');
  return { nativeState, firstTime, secondTime };
}
