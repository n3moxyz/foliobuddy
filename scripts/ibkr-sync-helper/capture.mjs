function requireValue(value, message) {
  if (!value) throw new Error(message);
}

export function sourceData(response) {
  requireValue(
    response && response.isError !== true && Array.isArray(response.content),
    'IBKR returned an incomplete or failed response.'
  );
  const data = response.structuredContent;
  requireValue(
    data && typeof data === 'object' && !Array.isArray(data),
    'IBKR did not return structured account data.'
  );
  return data;
}

function number(value) {
  requireValue(
    typeof value === 'number' && Number.isFinite(value),
    'IBKR returned an invalid amount.'
  );
  return value;
}

function text(value) {
  requireValue(
    typeof value === 'string' && value.length > 0,
    'IBKR returned an incomplete identity.'
  );
  return value;
}

function fields(row, numeric, strings) {
  requireValue(row && typeof row === 'object', 'IBKR returned an incomplete row.');
  return Object.fromEntries([
    ...numeric.map((key) => [key, number(row[key])]),
    ...strings.map((key) => [key, text(row[key])]),
  ]);
}

export function normalizeSample(receipt) {
  const positions = sourceData(receipt.positions).positions;
  const balances = sourceData(receipt.balances).balances;
  const summary = sourceData(receipt.summary);
  requireValue(
    Array.isArray(positions) && positions.length > 0 && positions.length <= 100,
    'IBKR positions are empty, incomplete or unsupported.'
  );
  requireValue(
    Array.isArray(balances) && balances.length > 0 && balances.length <= 40,
    'IBKR currency balances are incomplete.'
  );
  return {
    capturedAt: receipt.receivedAt,
    positions: positions.map((row) =>
      fields(
        row,
        ['contract_id', 'position', 'average_price', 'market_price', 'market_value'],
        ['contract_description', 'currency', 'asset_class']
      )
    ),
    balances: balances.map((row) =>
      fields(row, ['cash_balance', 'exchange_rate', 'stock_market_value'], ['currency'])
    ),
    summary: fields(
      summary,
      ['total_cash_value', 'gross_position_value', 'net_liquidation'],
      ['currency']
    ),
  };
}

export function normalizeExecutions(response, capturedAt) {
  const trades = sourceData(response).trades;
  requireValue(
    Array.isArray(trades) && trades.length <= 2000,
    'IBKR executions are incomplete or need a larger review.'
  );
  return trades
    .filter((trade) => trade.sec_type !== 'CASH')
    .map((trade) => {
      requireValue(
        trade.sec_type === 'STK',
        'A broker execution has an unsupported instrument type.'
      );
      const date = text(trade.trade_time);
      requireValue(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(date),
        'A broker execution needs an unambiguous UTC date.'
      );
      const parsed = Date.parse(date);
      requireValue(
        Number.isFinite(parsed) &&
          new Date(parsed).toISOString() === date.replace(/(?<!\.\d{3})Z$/, '.000Z') &&
          parsed <= Date.parse(capturedAt),
        'A broker execution date is invalid or later than the capture.'
      );
      requireValue(
        ['BUY', 'SELL'].includes(trade.side),
        'A broker execution has an ambiguous side.'
      );
      requireValue(
        typeof trade.symbol === 'string' && /^[A-Z0-9.^-]{1,40}$/.test(trade.symbol),
        'A broker execution has an ambiguous symbol.'
      );
      requireValue(
        typeof trade.currency === 'string' && /^[A-Z]{3}$/.test(trade.currency),
        'A broker execution has an ambiguous currency.'
      );
      requireValue(number(trade.size) > 0, 'A broker execution has an invalid quantity.');
      return {
        id: text(trade.trade_id),
        symbol: trade.symbol,
        currency: trade.currency,
        side: trade.side,
        quantity: trade.size,
        date: new Date(parsed).toISOString(),
      };
    });
}

/** Timestamp each complete, newly received sample; never relabel a cached capture. */
export async function collectCapture(client, save) {
  async function sample(name) {
    const startedAt = new Date().toISOString();
    const summary = await client.read('summary');
    sourceData(summary);
    const responses = await Promise.allSettled([client.read('positions'), client.read('balances')]);
    for (const response of responses) {
      if (response.status !== 'fulfilled') throw response.reason;
      sourceData(response.value);
    }
    const receipt = {
      startedAt,
      receivedAt: new Date().toISOString(),
      summary,
      positions: responses[0].value,
      balances: responses[1].value,
    };
    await save(`${name}-receipt.json`, receipt);
    return normalizeSample(receipt);
  }
  const first = await sample('first');
  const trades = await client.read('executions');
  await save('execution-receipt.json', { receivedAt: new Date().toISOString(), response: trades });
  const second = await sample('second');
  requireValue(
    Date.parse(second.capturedAt) - Date.parse(first.capturedAt) <= 180000,
    'IBKR reads took more than three minutes. Try again.'
  );
  const capture = {
    version: 1,
    first,
    second,
    executions: normalizeExecutions(trades, second.capturedAt),
  };
  await save('broker-capture.json', capture);
  return capture;
}
