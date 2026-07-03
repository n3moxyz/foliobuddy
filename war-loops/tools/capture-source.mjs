import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const rendersDir = join(root, 'renders');
const sourceUrl = process.argv[2] ?? 'http://127.0.0.1:4002/dev/demo';

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'mobile', width: 390, height: 844 },
];

await mkdir(rendersDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const captures = [];

for (const viewport of viewports) {
  const page = await browser.newPage({ viewport });
  const consoleMessages = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleMessages.push({ type: msg.type(), text: msg.text() });
    }
  });

  await page.goto(sourceUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(rendersDir, `source-${viewport.name}.png`), fullPage: true });
  await page.screenshot({
    path: join(rendersDir, `source-${viewport.name}-viewport.png`),
    fullPage: false,
  });

  const data = await page.evaluate(() => {
    const selectors = [
      'body',
      'aside',
      'main',
      'header',
      'h1',
      'h2',
      'h3',
      'button',
      'a',
      'section',
      '.recharts-wrapper',
      '[class*="Card"]',
      '[class*="grid"]',
    ];
    const seen = new Set();
    const elements = [];

    for (const selector of selectors) {
      for (const el of Array.from(document.querySelectorAll(selector)).slice(0, 70)) {
        if (seen.has(el)) continue;
        seen.add(el);
        const rect = el.getBoundingClientRect();
        if (rect.width < 4 || rect.height < 4) continue;
        const style = getComputedStyle(el);
        elements.push({
          tag: el.tagName.toLowerCase(),
          selector,
          className: typeof el.className === 'string' ? el.className.slice(0, 160) : '',
          text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 220),
          box: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          style: {
            display: style.display,
            position: style.position,
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            lineHeight: style.lineHeight,
            color: style.color,
            backgroundColor: style.backgroundColor,
            borderColor: style.borderColor,
            borderRadius: style.borderRadius,
            boxShadow: style.boxShadow,
            padding: style.padding,
            margin: style.margin,
            gap: style.gap,
            opacity: style.opacity,
            transform: style.transform,
          },
        });
      }
    }

    const visibleText = Array.from(
      document.body.querySelectorAll('h1,h2,h3,p,span,button,a,td,th,div')
    )
      .map((el) => (el.textContent || '').trim().replace(/\s+/g, ' '))
      .filter(Boolean)
      .filter((value, index, values) => values.indexOf(value) === index)
      .slice(0, 160);

    const motions = Array.from(document.querySelectorAll('*'))
      .map((el) => {
        const style = getComputedStyle(el);
        const hasMotion = style.animationName !== 'none' || style.transitionDuration !== '0s';
        if (!hasMotion) return null;
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          className: typeof el.className === 'string' ? el.className.slice(0, 160) : '',
          text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
          box: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          animationName: style.animationName,
          animationDuration: style.animationDuration,
          animationTimingFunction: style.animationTimingFunction,
          transitionProperty: style.transitionProperty,
          transitionDuration: style.transitionDuration,
          transitionTimingFunction: style.transitionTimingFunction,
        };
      })
      .filter(Boolean)
      .slice(0, 120);

    const palette = Array.from(document.querySelectorAll('*'))
      .flatMap((el) => {
        const style = getComputedStyle(el);
        return [style.color, style.backgroundColor, style.borderColor].filter(
          (value) => value && value !== 'rgba(0, 0, 0, 0)'
        );
      })
      .reduce((acc, value) => {
        acc[value] = (acc[value] || 0) + 1;
        return acc;
      }, {});

    return {
      url: location.href,
      title: document.title,
      viewport: { width: innerWidth, height: innerHeight },
      documentSize: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      },
      bodyClass: document.body.className,
      rootClass: document.documentElement.className,
      visibleText,
      elements,
      motions,
      palette: Object.entries(palette)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 32)
        .map(([color, count]) => ({ color, count })),
    };
  });

  await writeFile(join(root, `source-${viewport.name}-data.json`), JSON.stringify(data, null, 2));
  captures.push({ viewport, data, consoleMessages });
  await page.close();
}

await browser.close();
await writeFile(
  join(root, 'source-capture-summary.json'),
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      sourceUrl,
      browser: 'Playwright Chromium using system Chrome channel',
      captures: captures.map(({ viewport, data, consoleMessages }) => ({
        viewport,
        finalUrl: data.url,
        title: data.title,
        documentSize: data.documentSize,
        textSample: data.visibleText.slice(0, 30),
        elements: data.elements.length,
        motions: data.motions.length,
        consoleMessages,
      })),
    },
    null,
    2
  )
);
