import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toBlob } from 'html-to-image';
import { copyChartAsPng } from '@/lib/chartCopy';

vi.mock('html-to-image', () => ({
  toBlob: vi.fn(),
}));

const toBlobMock = vi.mocked(toBlob);
const clipboardWrite = vi.fn();

class ClipboardItemMock {
  readonly items: Record<string, Blob>;

  constructor(items: Record<string, Blob>) {
    this.items = items;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { write: clipboardWrite },
  });
  Object.defineProperty(globalThis, 'ClipboardItem', {
    configurable: true,
    value: ClipboardItemMock,
  });
});

describe('copyChartAsPng', () => {
  it('renders the card as PNG and writes it to the clipboard', async () => {
    const card = document.createElement('div');
    const blob = new Blob(['chart'], { type: 'image/png' });
    toBlobMock.mockResolvedValue(blob);
    clipboardWrite.mockResolvedValue(undefined);

    await copyChartAsPng(card);

    expect(toBlobMock).toHaveBeenCalledWith(
      card,
      expect.objectContaining({
        backgroundColor: expect.any(String),
        pixelRatio: expect.any(Number),
        filter: expect.any(Function),
      })
    );
    const clipboardItem = clipboardWrite.mock.calls[0][0][0] as ClipboardItemMock;
    expect(clipboardItem.items['image/png']).toBe(blob);
  });

  it('excludes controls marked as copy-only chrome', async () => {
    const card = document.createElement('div');
    const copyButton = document.createElement('button');
    copyButton.setAttribute('data-chart-copy-exclude', '');
    toBlobMock.mockResolvedValue(new Blob(['chart'], { type: 'image/png' }));
    clipboardWrite.mockResolvedValue(undefined);

    await copyChartAsPng(card);

    const options = toBlobMock.mock.calls[0][1];
    expect(options?.filter?.(card)).toBe(true);
    expect(options?.filter?.(copyButton)).toBe(false);
  });

  it('fails clearly when PNG clipboard writes are unavailable', async () => {
    Object.defineProperty(globalThis, 'ClipboardItem', {
      configurable: true,
      value: undefined,
    });

    await expect(copyChartAsPng(document.createElement('div'))).rejects.toThrow(
      'does not support copying images'
    );
  });
});
