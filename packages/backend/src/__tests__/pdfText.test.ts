import { describe, expect, it } from 'vitest';
import { extractPdfText } from '../services/statementParsers/pdfText.js';
import { makePdf, textLines } from './helpers/pdf.js';

const LIMITS = { maxPages: 10, maxTextChars: 100_000, timeoutMs: 5_000 };
const PERIOD = 'For the period from 1 January 2026 to 28 February 2026';

// 30 MB of text operators in a ~30 KB file: over a second of pdf.js work.
function slowPdf(): Buffer {
  return makePdf(textLines(Array<string>(30_000).fill('A'.repeat(1_000))));
}

describe('extractPdfText', () => {
  it('reads the text of every page', async () => {
    const read = await extractPdfText(makePdf(textLines(['UOB Kay Hian', PERIOD]), 2), LIMITS);

    expect(read.status).toBe('ok');
    expect(read.status === 'ok' && read.text.split(PERIOD)).toHaveLength(3);
  });

  it('reports a PDF with more pages than the limit', async () => {
    expect(await extractPdfText(makePdf(textLines(['page']), 10), LIMITS)).toMatchObject({
      status: 'ok',
    });
    expect(await extractPdfText(makePdf(textLines(['page']), 11), LIMITS)).toEqual({
      status: 'too-many-pages',
      pages: 11,
    });
  });

  it('reports text longer than the limit instead of sending it back', async () => {
    const pdf = makePdf(textLines([PERIOD]));
    const full = await extractPdfText(pdf, LIMITS);
    const length = full.status === 'ok' ? full.text.length : NaN;

    expect(await extractPdfText(pdf, { ...LIMITS, maxTextChars: length })).toMatchObject({
      status: 'ok',
    });
    expect(await extractPdfText(pdf, { ...LIMITS, maxTextChars: length - 1 })).toEqual({
      status: 'too-much-text',
      chars: length,
    });
  });

  it('stops a PDF that runs past its budget without blocking the event loop', async () => {
    const pdf = slowPdf();
    const ticks: number[] = [];
    const ticker = setInterval(() => ticks.push(performance.now()), 10);
    const started = performance.now();

    const read = await extractPdfText(pdf, { ...LIMITS, timeoutMs: 300 });
    const finished = performance.now();
    clearInterval(ticker);

    expect(read).toEqual({ status: 'too-costly' });
    expect(finished - started).toBeLessThan(1_000);
    const points = [started, ...ticks, finished];
    const longestStall = Math.max(...points.slice(1).map((t, i) => t - points[i]));
    expect(longestStall).toBeLessThan(100);

    // Terminated, not abandoned: the process goes quiet instead of parsing on.
    const cpuBefore = process.cpuUsage();
    await new Promise((resolve) => setTimeout(resolve, 400));
    const cpu = process.cpuUsage(cpuBefore);
    expect((cpu.user + cpu.system) / 1_000).toBeLessThan(200);
  });

  it('rejects bytes that are not a PDF', async () => {
    await expect(extractPdfText(Buffer.from('not a pdf'), LIMITS)).rejects.toThrow(/Invalid PDF/);
  });

  it('reads one PDF at a time', async () => {
    const slow = extractPdfText(slowPdf(), { ...LIMITS, timeoutMs: 300 });

    expect(await extractPdfText(makePdf(textLines([PERIOD])), LIMITS)).toEqual({
      status: 'busy',
    });
    expect(await slow).toEqual({ status: 'too-costly' });
    expect(await extractPdfText(makePdf(textLines([PERIOD])), LIMITS)).toMatchObject({
      status: 'ok',
    });
  });
});
