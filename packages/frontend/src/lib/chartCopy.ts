import { toBlob } from 'html-to-image';

const COPY_EXCLUDE_ATTRIBUTE = 'data-chart-copy-exclude';

/** Render a chart card at retina resolution and write it to the system clipboard as PNG. */
export async function copyChartAsPng(element: HTMLElement): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('This browser does not support copying images to the clipboard.');
  }

  const pixelRatio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const backgroundColor = window.getComputedStyle(element).backgroundColor;
  const blob = await toBlob(element, {
    backgroundColor,
    pixelRatio,
    filter: (node) => !(node instanceof HTMLElement && node.hasAttribute(COPY_EXCLUDE_ATTRIBUTE)),
  });

  if (!blob) {
    throw new Error('The chart could not be rendered as an image.');
  }

  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
