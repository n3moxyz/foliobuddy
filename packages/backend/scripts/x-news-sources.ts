/**
 * Prints the X_NEWS_SOURCES value (`handle:allowed_use,…`) built from the
 * validatex roster CSV. It writes and sends nothing: the roster is private, so
 * pipe the output straight into the secret instead of committing it anywhere.
 *
 *   npm run -s news:x-sources -- <path/to/verified-ai-roster.csv>
 *   npm run -s news:x-sources -- <csv> | gh secret set X_NEWS_SOURCES   # stdin, not argv
 *
 * Exits non-zero (still printing the valid entries) when a row has an unknown
 * policy or an invalid handle, so a new validatex policy is never dropped silently.
 */
import { readFileSync } from 'node:fs';
import { parseXNewsSources } from '../src/services/news/xSources.js';

/** Minimal RFC 4180 reader: quoted fields may hold commas, quotes and newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const csvPath = process.argv[2];
if (!csvPath) {
  process.stderr.write('Usage: npm run -s news:x-sources -- <path/to/verified-ai-roster.csv>\n');
  process.exit(1);
}

const [header = [], ...rows] = parseCsv(readFileSync(csvPath, 'utf8'));
const handleColumn = header.indexOf('handle');
const policyColumn = header.indexOf('allowed_use');
if (handleColumn === -1 || policyColumn === -1) {
  process.stderr.write('Expected "handle" and "allowed_use" columns in the CSV header.\n');
  process.exit(1);
}

const entries = rows
  .filter((row) => row.some((cell) => cell.trim().length > 0))
  .map((row) => `${(row[handleColumn] ?? '').trim()}:${(row[policyColumn] ?? '').trim()}`);
const roster = parseXNewsSources(entries.join(','));
if (roster.oversized) {
  process.stderr.write('The roster is too large for X_NEWS_SOURCES (over 20,000 characters).\n');
  process.exit(1);
}
if (roster.skipped.length > 0) {
  const lines = roster.skipped.map(
    (skip) => `  entry ${skip.position}: ${skip.entry} (${skip.reason})`
  );
  process.stderr.write(
    `Skipped (unknown policy or invalid handle — map new policies in xSources.ts):\n${lines.join('\n')}\n`
  );
  process.exitCode = 1;
}
process.stderr.write(`${roster.sources.length} handles\n`);
process.stdout.write(roster.sources.map((source) => `${source.handle}:${source.policy}`).join(','));
