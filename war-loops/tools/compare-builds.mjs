import { chromium } from 'playwright';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const rendersDir = join(root, 'renders');
const spec = JSON.parse(await readFile(join(root, 'spec.json'), 'utf8'));

const keyStrings = [
  'Dashboard',
  'DB OK',
  'Nemo',
  '$314,021',
  '+26.20%',
  'YTD P&L',
  '$65,195',
  'YTD Start',
  '$248,826',
  'Exposure',
  '88.4%',
  'Portfolio $ Value',
  'Portfolio % vs Benchmarks',
  'BTC +13.9%',
  'ETH +13.9%',
  'SPX +13.9%',
  'By Asset',
  'Crypto Breakdown',
  'By Storage',
  'Cash Breakdown',
  'Top Performers',
  'Worst Performers',
  'PUNK-7614',
  'Last updated: 2 Jul 2026, 13:55',
];

const targets = [
  { name: 'pencil', file: join(root, 'pencil', 'index.html') },
  { name: 'forge', file: join(root, 'forge', 'index.html') },
];

const viewports = spec.viewports;

function scoreVisual(sourcePath, renderPath) {
  return Promise.all([loadImage(sourcePath), loadImage(renderPath)]).then(([source, render]) => {
    const width = 220;
    const sourceHeight = Math.round((source.height / source.width) * width);
    const renderHeight = Math.round((render.height / render.width) * width);
    const height = Math.max(sourceHeight, renderHeight);
    const sourceCanvas = createCanvas(width, height);
    const renderCanvas = createCanvas(width, height);
    const sourceCtx = sourceCanvas.getContext('2d');
    const renderCtx = renderCanvas.getContext('2d');
    sourceCtx.fillStyle = '#fcfcfd';
    renderCtx.fillStyle = '#fcfcfd';
    sourceCtx.fillRect(0, 0, width, height);
    renderCtx.fillRect(0, 0, width, height);
    sourceCtx.drawImage(source, 0, 0, width, sourceHeight);
    renderCtx.drawImage(render, 0, 0, width, renderHeight);

    const sourceData = sourceCtx.getImageData(0, 0, width, height).data;
    const renderData = renderCtx.getImageData(0, 0, width, height).data;
    let delta = 0;
    for (let i = 0; i < sourceData.length; i += 4) {
      delta += Math.abs(sourceData[i] - renderData[i]);
      delta += Math.abs(sourceData[i + 1] - renderData[i + 1]);
      delta += Math.abs(sourceData[i + 2] - renderData[i + 2]);
    }
    const channels = (sourceData.length / 4) * 3;
    const mean = delta / channels / 255;
    const heightPenalty =
      Math.abs(source.height - render.height) / Math.max(source.height, render.height);
    const score = Math.max(0, Math.round(100 - mean * 145 - heightPenalty * 18));
    return {
      score,
      meanPixelDelta: Number(mean.toFixed(4)),
      sourceSize: { width: source.width, height: source.height },
      renderSize: { width: render.width, height: render.height },
      heightPenalty: Number(heightPenalty.toFixed(4)),
    };
  });
}

function layoutScore(sourceDoc, renderDoc) {
  const widthPenalty =
    Math.abs(sourceDoc.width - renderDoc.width) / Math.max(sourceDoc.width, renderDoc.width);
  const heightPenalty =
    Math.abs(sourceDoc.height - renderDoc.height) / Math.max(sourceDoc.height, renderDoc.height);
  return Math.max(0, Math.round(100 - widthPenalty * 60 - heightPenalty * 90));
}

function contentScore(text) {
  const normalized = text.replace(/\s+/g, ' ');
  const matched = keyStrings.filter((item) => normalized.includes(item));
  return {
    score: Math.round((matched.length / keyStrings.length) * 100),
    matched: matched.length,
    total: keyStrings.length,
    missing: keyStrings.filter((item) => !normalized.includes(item)),
  };
}

function motionScore(target, activeAtStart, activeSettled) {
  if (target === 'pencil') {
    return {
      score: activeAtStart === 0 && activeSettled === 0 ? 100 : 50,
      detail: `${activeAtStart} active at start, ${activeSettled} settled`,
    };
  }
  const hasStartMotion = activeAtStart >= 4;
  const hasAmbient = activeSettled >= 1;
  return {
    score: hasStartMotion && hasAmbient ? 100 : hasStartMotion ? 85 : 45,
    detail: `${activeAtStart} active at start, ${activeSettled} settled`,
  };
}

await mkdir(rendersDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];

for (const target of targets) {
  const url = pathToFileURL(target.file).href;
  for (const viewport of viewports) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
    });
    const consoleMessages = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        consoleMessages.push({ type: msg.type(), text: msg.text() });
      }
    });

    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(220);
    const activeAtStart = await page.evaluate(
      () => document.getAnimations().filter((animation) => animation.playState === 'running').length
    );

    if (target.name === 'forge') {
      await page.screenshot({
        path: join(rendersDir, `${target.name}-${viewport.name}-motion.png`),
        fullPage: true,
      });
      await page.waitForTimeout(1750);
    } else {
      await page.waitForTimeout(350);
    }

    const renderPath = join(rendersDir, `${target.name}-${viewport.name}.png`);
    await page.screenshot({ path: renderPath, fullPage: true });
    const pageData = await page.evaluate(() => ({
      title: document.title,
      url: location.href,
      text: document.body.innerText,
      documentSize: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      },
      activeAnimations: document
        .getAnimations()
        .filter((animation) => animation.playState === 'running').length,
      panelCount: document.querySelectorAll('.panel').length,
      sidebarVisible: getComputedStyle(document.querySelector('.sidebar')).display !== 'none',
      donutCards: document.querySelectorAll('.donut-card').length,
    }));

    const sourcePath = join(rendersDir, `source-${viewport.name}.png`);
    const visual = await scoreVisual(sourcePath, renderPath);
    const layout = layoutScore(viewport.sourceDocument, pageData.documentSize);
    const content = contentScore(pageData.text);
    const motion = motionScore(target.name, activeAtStart, pageData.activeAnimations);
    const overall = Math.round(
      visual.score * 0.55 + layout * 0.2 + content.score * 0.15 + motion.score * 0.1
    );

    const passed =
      visual.score >= spec.gates.visualScoreMinimum &&
      layout >= spec.gates.layoutScoreMinimum &&
      content.score >= spec.gates.contentScoreMinimum &&
      motion.score >= (target.name === 'pencil' ? 95 : 85);

    results.push({
      target: target.name,
      viewport: viewport.name,
      passed,
      overall,
      visual,
      layout,
      content,
      motion,
      pageData,
      consoleMessages,
      render: `renders/${target.name}-${viewport.name}.png`,
      motionRender:
        target.name === 'forge' ? `renders/${target.name}-${viewport.name}-motion.png` : null,
    });

    await page.close();
  }
}

await browser.close();

const summary = {
  generatedAt: new Date().toISOString(),
  gates: spec.gates,
  results,
  weakest: [...results].sort((a, b) => a.overall - b.overall)[0],
};

await writeFile(join(root, 'scores.json'), JSON.stringify(summary, null, 2));

const lines = [
  '# War Loops Comparison Summary',
  '',
  `Generated: ${summary.generatedAt}`,
  '',
  '| Build | Viewport | Pass | Overall | Visual | Layout | Content | Motion |',
  '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...results.map(
    (result) =>
      `| ${result.target} | ${result.viewport} | ${result.passed ? 'yes' : 'no'} | ${result.overall} | ${result.visual.score} | ${result.layout} | ${result.content.score} | ${result.motion.score} |`
  ),
  '',
  `Weakest signal: ${summary.weakest.target} ${summary.weakest.viewport} overall ${summary.weakest.overall} (visual ${summary.weakest.visual.score}, layout ${summary.weakest.layout}).`,
  '',
  'Notes:',
  '- Visual score is a normalized full-page pixel-stat comparison against the source render.',
  '- Layout score is based on document width/height drift against the captured source dimensions.',
  '- Content score checks required dashboard strings.',
  '- Motion score expects Pencil to be still and Forge to animate at start while retaining ambient Dev Mode motion.',
];

await writeFile(join(root, 'comparison-summary.md'), `${lines.join('\n')}\n`);
console.log(JSON.stringify(summary, null, 2));
