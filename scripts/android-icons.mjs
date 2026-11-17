/**
 * Regenerates the Android launcher / splash artwork from the XCron CV brand mark.
 *
 * The app used to ship Capacitor's default "robot" icon and splash. Run this after a
 * brand change; it rasterises the same vector geometry as
 * `res/drawable/ic_launcher_foreground.xml` so legacy (pre-Android 8) launchers,
 * adaptive icons and the splash screen stay identical.
 *
 *   node scripts/android-icons.mjs
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RES = path.join(ROOT, 'apps/android/app/src/main/res');

/** Brand tokens from apps/web/src/styles.scss. */
const VIOLET = '#7c5cff';
const AMBER = '#f5a524';
const INK = '#1a1208';
const LIGHT_BG = '#f7f5fc';

const GRADIENT = `<defs>
  <linearGradient id="brand" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${VIOLET}"/>
    <stop offset="1" stop-color="${AMBER}"/>
  </linearGradient>
</defs>`;

/** Bold rounded "X", matching the web brand mark. Coordinates are in a 108 unit box. */
function xMark({ from, to, width, color = INK }) {
  return `<path d="M${from} ${from}L${to} ${to}M${to} ${from}L${from} ${to}"
    fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
}

const LEGACY_MARK = xMark({ from: 34, to: 74, width: 15 });
/** Adaptive icons are masked; keep the mark inside the 66dp safe zone. */
const ADAPTIVE_MARK = xMark({ from: 40, to: 68, width: 11 });

function iconSvg({ shape = 'rounded', mark = LEGACY_MARK }) {
  const tile =
    shape === 'circle'
      ? '<circle cx="54" cy="54" r="54" fill="url(#brand)"/>'
      : '<rect width="108" height="108" rx="24" fill="url(#brand)"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="108" height="108" viewBox="0 0 108 108">${GRADIENT}${tile}${mark}</svg>`;
}

const FOREGROUND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="108" height="108" viewBox="0 0 108 108">${GRADIENT}${ADAPTIVE_MARK}</svg>`;


function splashSvg(width, height) {
  const size = Math.round(Math.min(width, height) * 0.34);
  const x = (width - size) / 2;
  const y = (height - size) / 2;
  const scale = size / 108;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="${LIGHT_BG}"/>
    <g transform="translate(${x} ${y}) scale(${scale})">${GRADIENT}${iconSvgBody()}</g>
  </svg>`;
}

function iconSvgBody() {
  return `<rect width="108" height="108" rx="24" fill="url(#brand)"/>${LEGACY_MARK}`;
}

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const SPLASH_SIZES = {
  'drawable': [[480, 320]],
  'drawable-land-mdpi': [[480, 320]],
  'drawable-land-hdpi': [[800, 480]],
  'drawable-land-xhdpi': [[1280, 720]],
  'drawable-land-xxhdpi': [[1600, 960]],
  'drawable-land-xxxhdpi': [[1920, 1280]],
  'drawable-port-mdpi': [[320, 480]],
  'drawable-port-hdpi': [[480, 800]],
  'drawable-port-xhdpi': [[720, 1280]],
  'drawable-port-xxhdpi': [[960, 1600]],
  'drawable-port-xxxhdpi': [[1280, 1920]],
};

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
await page.setContent('<!doctype html><html><body style="margin:0;background:transparent"></body></html>');

async function render(svg, width, height, outPath) {
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:transparent">
      <div id="art" style="width:${width}px;height:${height}px">${svg}</div>
    </body></html>`,
  );
  await mkdir(path.dirname(outPath), { recursive: true });
  await page.locator('#art').screenshot({ path: outPath, omitBackground: true });
}

for (const [density, factor] of Object.entries(DENSITIES)) {
  const legacy = Math.round(48 * factor);
  await render(iconSvg({ shape: 'rounded' }), legacy, legacy, path.join(RES, `mipmap-${density}`, 'ic_launcher.png'));
  await render(iconSvg({ shape: 'circle' }), legacy, legacy, path.join(RES, `mipmap-${density}`, 'ic_launcher_round.png'));
  const adaptive = Math.round(108 * factor);
  await render(FOREGROUND_SVG, adaptive, adaptive, path.join(RES, `mipmap-${density}`, 'ic_launcher_foreground.png'));
}

for (const [dir, sizes] of Object.entries(SPLASH_SIZES)) {
  for (const [width, height] of sizes) {
    await render(splashSvg(width, height), width, height, path.join(RES, dir, 'splash.png'));
  }
}

await browser.close();
console.log('Android icons + splashes regenerated from the XCron CV brand mark.');
