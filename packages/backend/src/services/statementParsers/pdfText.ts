import { Worker } from 'node:worker_threads';

export interface PdfTextLimits {
  /** Pages read; a longer PDF is reported as `too-many-pages`. */
  maxPages: number;
  /** Longer text is reported as `too-much-text` and never sent back. */
  maxTextChars: number;
  /** Wall-clock budget; the reader is terminated when it runs out. */
  timeoutMs: number;
}

export type PdfTextResult =
  | { status: 'ok'; text: string }
  | { status: 'too-many-pages'; pages: number }
  | { status: 'too-much-text'; chars: number }
  | { status: 'too-costly' }
  | { status: 'busy' };

// A hostile PDF can hold a few hundred MB of decoded streams until its budget
// runs out, so only one read runs at a time.
const MAX_CONCURRENT_READS = 1;
// Real statements need a few MB of heap; hitting this counts as `too-costly`.
const READER_HEAP_MB = 128;
const PDF_PARSE_URL = import.meta.resolve('pdf-parse');

// pdf.js parses synchronously on the thread that calls it. On the main thread
// one crafted PDF (thousands of pages, or a small stream that inflates to
// gigabytes) froze every request, and no timer could fire to stop it, so the
// reader runs in a worker that is terminated at the deadline. It is inline
// JavaScript so dev (tsx), tests (vitest) and the build run the same code,
// using only import() so it runs whether Node evaluates it as CJS or ESM.
const READER_SOURCE = `
(async () => {
  const { parentPort, workerData } = await import('node:worker_threads');
  const { PDFParse } = await import(workerData.pdfParseUrl);
  const parser = new PDFParse({ data: workerData.pdf });
  try {
    const result = await parser.getText({ first: workerData.maxPages });
    if (result.total > workerData.maxPages) {
      parentPort.postMessage({ status: 'too-many-pages', pages: result.total });
    } else if (result.text.length > workerData.maxTextChars) {
      parentPort.postMessage({ status: 'too-much-text', chars: result.text.length });
    } else {
      parentPort.postMessage({ status: 'ok', text: result.text });
    }
  } finally {
    await parser.destroy();
  }
})();
`;

let activeReads = 0;

/**
 * Extracts a PDF's text in a worker thread, within `limits`. Rejects when
 * pdf.js can't read the file at all.
 */
export async function extractPdfText(
  pdf: Uint8Array,
  limits: PdfTextLimits
): Promise<PdfTextResult> {
  if (activeReads >= MAX_CONCURRENT_READS) return { status: 'busy' };
  activeReads++;
  try {
    return await readInWorker(pdf, limits);
  } finally {
    activeReads--;
  }
}

function readInWorker(pdf: Uint8Array, limits: PdfTextLimits): Promise<PdfTextResult> {
  const worker = new Worker(READER_SOURCE, {
    eval: true,
    workerData: {
      pdf,
      pdfParseUrl: PDF_PARSE_URL,
      maxPages: limits.maxPages,
      maxTextChars: limits.maxTextChars,
    },
    resourceLimits: { maxOldGenerationSizeMb: READER_HEAP_MB },
  });
  let deadline: ReturnType<typeof setTimeout> | undefined;
  return new Promise<PdfTextResult>((resolve, reject) => {
    deadline = setTimeout(() => resolve({ status: 'too-costly' }), limits.timeoutMs);
    worker.once('message', (result: PdfTextResult) => resolve(result));
    worker.once('error', (error: Error & { code?: string }) =>
      error.code === 'ERR_WORKER_OUT_OF_MEMORY' ? resolve({ status: 'too-costly' }) : reject(error)
    );
    worker.once('exit', () => reject(new Error('PDF reader stopped unexpectedly')));
  }).finally(() => {
    clearTimeout(deadline);
    void worker.terminate();
  });
}
