import { logger } from '../../lib/logger.js';
import type { ParsedHolding, ParsedStatement } from './uobKayHian.js';

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseEnglishDate(dateStr: string): string | null {
  const match = dateStr.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = MONTHS[match[2].toLowerCase()];
  const year = parseInt(match[3], 10);
  if (month === undefined) return null;
  return new Date(Date.UTC(year, month, day)).toISOString();
}

function stripThousands(s: string): number {
  return parseFloat(s.replace(/,/g, ''));
}

function extractPeriodEnd(text: string): string | null {
  let m = text.match(/UNIT TRUST HOLDINGS AS AT\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
  if (!m) {
    m = text.match(/Statement Period:[\s\S]*?to\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
  }
  return m ? parseEnglishDate(m[1]) : null;
}

// One holding's value block in iFAST/FSMOne unit trust holdings table:
//   priceCcy price paymentMethod wacCcy wac quantity invCcy invAmt pnlCcy pnl pnl% mvCcy mv
// Whitespace is loose because pdf-parse interleaves tokens across visual lines.
const VALUE_BLOCK_REGEX =
  /([A-Z]{3})\s+([\d,]+\.\d+)\s+(\S+)\s+([A-Z]{3})\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([A-Z]{3})\s+([\d,]+\.\d+)\s+([A-Z]{3})\s+(-?[\d,]+\.\d+)\s+(-?[\d,]+\.\d+)\s+([A-Z]{3})\s+([\d,]+\.\d+)/g;

const PAYMENT_METHOD_TOKENS = /^(Cash|RSP|CPF-OA|CPF-SA|CPF|SRS|IA)$/i;

function symbolFromName(name: string): string {
  return (
    name
      .split(/\s+/)
      .slice(0, 3)
      .map((w) => w.replace(/[^A-Za-z0-9]/g, '').toUpperCase())
      .filter(Boolean)
      .join('')
      .slice(0, 8) || name.slice(0, 8).toUpperCase()
  );
}

export function parseFsmOneStatement(text: string): ParsedStatement {
  if (!/(FSMOne|fundsupermart|iFAST\s+Financial)/i.test(text)) {
    throw new Error('Not an FSMOne statement');
  }

  const periodEnd = extractPeriodEnd(text);

  const headerMatch = text.match(
    /UNIT TRUST HOLDINGS AS AT[\s\S]*?Current\s+Market[\s\S]*?Value\s*\(B\)/i
  );
  if (!headerMatch || headerMatch.index === undefined) {
    throw new Error('FSMOne: unit trust holdings table header not found');
  }
  const sectionStart = headerMatch.index + headerMatch[0].length;
  const trailerOffset = text.slice(sectionStart).search(/TOTAL UNIT TRUST HOLDINGS/i);
  if (trailerOffset === -1) {
    throw new Error('FSMOne: unit trust holdings totals row not found');
  }
  const region = text.slice(sectionStart, sectionStart + trailerOffset);

  const holdings: ParsedHolding[] = [];
  let cursor = 0;
  VALUE_BLOCK_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = VALUE_BLOCK_REGEX.exec(region)) !== null) {
    const rawName = region.slice(cursor, m.index).trim();
    cursor = m.index + m[0].length;

    const nameTokens = rawName.split(/\s+/).filter(Boolean);
    // Drop trailing payment-method tokens that get glued onto the name when
    // the regex anchors on the second occurrence (e.g. fund name ends in "Cash").
    while (
      nameTokens.length > 1 &&
      PAYMENT_METHOD_TOKENS.test(nameTokens[nameTokens.length - 1])
    ) {
      nameTokens.pop();
    }
    const name = nameTokens.join(' ').trim();
    if (!name) continue;

    const productCcy = m[1];
    const navNative = stripThousands(m[2]);
    const avgCostNative = stripThousands(m[5]);
    const units = stripThousands(m[6]);
    const pnlSgd = stripThousands(m[10]);

    if (isNaN(units) || isNaN(avgCostNative) || isNaN(navNative)) continue;

    // Native-currency P&L only when product currency equals SGD-equivalent currency.
    const sgdCcy = m[7];
    const gainLossNative = productCcy === sgdCcy && !isNaN(pnlSgd) ? pnlSgd : null;

    holdings.push({
      symbol: symbolFromName(name),
      name,
      isin: '',
      nativeCurrency: productCcy,
      units,
      avgCostNative,
      navNative,
      currentValueNative: units * navNative,
      gainLossNative,
      totalCostNative: units * avgCostNative,
    });
  }

  if (holdings.length === 0) {
    logger.warn('FSMOne parser found no holdings');
  }

  return {
    broker: 'FSMOne',
    periodEnd,
    holdings,
  };
}
