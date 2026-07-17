import { logger } from '../../lib/logger.js';

export interface ParsedHolding {
  symbol: string;
  name: string;
  isin: string;
  nativeCurrency: string;
  units: number;
  avgCostNative: number;
  navNative: number;
  currentValueNative: number;
  gainLossNative: number | null;
  totalCostNative: number;
}

export interface ParsedStatement {
  broker: string;
  periodEnd: string | null;
  holdings: ParsedHolding[];
}

const ISIN_REGEX = /\b(SGX[A-Z0-9]{9}|[A-Z]{2}[A-Z0-9]{9}[0-9])\b/;

const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

function parseEnglishDate(dateStr: string): string | null {
  const match = dateStr.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = MONTHS[match[2].toLowerCase()];
  const year = parseInt(match[3], 10);
  if (month === undefined) return null;
  const d = new Date(Date.UTC(year, month, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month || d.getUTCDate() !== day) {
    return null;
  }
  return d.toISOString();
}

function stripThousands(s: string): number {
  return parseFloat(s.replace(/,/g, ''));
}

function extractPeriodEnd(text: string): string | null {
  const match = text.match(/For the period from .+? to (\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
  return match ? parseEnglishDate(match[1]) : null;
}

function parseHoldingBlock(
  isinLine: string,
  isinMatch: RegExpMatchArray,
  prevLine: string,
  nextLines: string[]
): ParsedHolding | null {
  const isin = isinMatch[1];
  const isinIdx = isinLine.indexOf(isin);

  const namePart2 = isinLine.slice(0, isinIdx).trim();
  const afterIsin = isinLine.slice(isinIdx + isin.length).trim();

  const fullName = [prevLine.trim(), namePart2].filter(Boolean).join(' ').trim();

  const afterTokens = afterIsin.split(/\s+/).filter(Boolean);
  if (afterTokens.length < 4) return null;

  const currency = afterTokens[0];
  const assetClass = afterTokens[1];
  const qtyStr = afterTokens[2];
  let costIdx = 3;
  if (afterTokens[3] && isNaN(stripThousands(afterTokens[3]))) costIdx = 4;
  const avgCostStr = afterTokens[costIdx];

  const units = stripThousands(qtyStr);
  const avgCostNative = stripThousands(avgCostStr);
  if (
    !Number.isFinite(units) ||
    units <= 0 ||
    !Number.isFinite(avgCostNative) ||
    avgCostNative < 0
  ) {
    return null;
  }

  let navNative = NaN;
  let currentValueNative = NaN;
  let gainLossNative: number | null = null;

  const candidateValues: number[] = [];
  for (const line of nextLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^[-]?\d[\d,]*\.?\d*$/.test(trimmed)) {
      candidateValues.push(stripThousands(trimmed));
      if (!isNaN(navNative) && candidateValues.length >= 4) break;
      continue;
    }
    const dollarMatches = [...trimmed.matchAll(/\$\s*(-?[\d,]+\.\d{2})/g)];
    if (dollarMatches.length >= 1 && isNaN(currentValueNative)) {
      currentValueNative = stripThousands(dollarMatches[0][1]);
    }
    if (dollarMatches.length >= 2 && gainLossNative === null) {
      gainLossNative = stripThousands(dollarMatches[1][1]);
    }
    if (!isNaN(currentValueNative)) break;
  }

  if (candidateValues.length >= 2) {
    navNative = candidateValues[1];
  }
  if (!Number.isFinite(navNative) || navNative < 0) navNative = avgCostNative;

  const totalCostNative = units * avgCostNative;
  if (isNaN(currentValueNative)) {
    currentValueNative = units * navNative;
  }

  const symbolFromName =
    fullName
      .split(/\s+/)
      .slice(0, 3)
      .map((w) => w.replace(/[^A-Za-z0-9]/g, '').toUpperCase())
      .filter(Boolean)
      .join('')
      .slice(0, 8) || isin.slice(0, 8);

  return {
    symbol: symbolFromName,
    name: fullName,
    isin,
    nativeCurrency: currency,
    units,
    avgCostNative,
    navNative,
    currentValueNative,
    gainLossNative,
    totalCostNative,
  };
}

export function parseUobKhStatement(text: string): ParsedStatement {
  if (!/uob\s*kay\s*hian/i.test(text)) {
    throw new Error('Not a UOB Kay Hian statement');
  }

  const periodEnd = extractPeriodEnd(text);
  const lines = text.split(/\r?\n/);
  const holdings: ParsedHolding[] = [];
  const seenIsins = new Set<string>();

  let inHoldings = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/Portfolio Holdings/i.test(line)) inHoldings = true;
    if (/^\s*Total\s*\$/i.test(line) || /^Transactions from/i.test(line)) inHoldings = false;
    if (!inHoldings) continue;

    const isinMatch = line.match(ISIN_REGEX);
    if (!isinMatch) continue;
    if (seenIsins.has(isinMatch[1])) continue;

    const prevLine = lines[i - 1] || '';
    const nextLines = lines.slice(i + 1, i + 10);
    const holding = parseHoldingBlock(line, isinMatch, prevLine, nextLines);
    if (holding) {
      holdings.push(holding);
      seenIsins.add(holding.isin);
    }
  }

  if (holdings.length === 0) {
    logger.warn('UOB Kay Hian parser found no holdings');
  }

  return {
    broker: 'UOB Kay Hian',
    periodEnd,
    holdings,
  };
}
