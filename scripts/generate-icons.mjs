// Generates the Android launcher icons, splash screens, the web favicon and the PWA icons (public/icons/: manifest
// 192/512/maskable, iOS apple-touch-icon 180) from the logo (design/logo/pupitre-dessin.svg).
// Usage: node scripts/generate-icons.mjs   (needs the "playwright" dev dependency and its Chromium)
import { chromium } from 'playwright';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const res = new URL('android/app/src/main/res/', root);
const BG = '#f4ecd8';

// The drawing of logo 4 without its background (content box ≈ x 104–408, y 110–440, centre (256, 275)).
const logo = await readFile(new URL('design/logo/pupitre-dessin.svg', root), 'utf8');
const drawing = logo.replace(/^[\s\S]*?<rect[^>]*\/>/, '').replace(/<\/svg>\s*$/, '');
const svg = (body, { background = '' } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${background}${body}</svg>`;
const centred = (scale) => `<g transform="translate(256 256) scale(${scale}) translate(-256 -275)">${drawing}</g>`;

const variants = {
  // Legacy square icon (Android < 8): the full logo, rounded square.
  square: svg(centred(1), { background: `<rect width="512" height="512" rx="112" fill="${BG}"/>` }),
  // Legacy round icon.
  round: svg(centred(0.82), { background: `<circle cx="256" cy="256" r="256" fill="${BG}"/>` }),
  // Adaptive icon foreground (Android 8+): transparent, inside the 66/108 safe circle.
  foreground: svg(centred(0.6)),
};

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const browser = await chromium.launch();
const page = await browser.newPage();

async function render(markup, width, height, path, { transparent = false, fill } = {}) {
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<html><body style="margin:0;background:${transparent ? 'transparent' : fill ?? BG}">${markup}</body></html>`,
  );
  await page.screenshot({ path, omitBackground: transparent, clip: { x: 0, y: 0, width, height } });
}

for (const [density, k] of Object.entries(DENSITIES)) {
  const icon = Math.round(48 * k);
  const fg = Math.round(108 * k);
  const dir = new URL(`mipmap-${density}/`, res).pathname;
  const box = (s, w = s) => `<div style="width:${w}px;height:${s}px">`;
  await render(`${box(icon)}${variants.square.replace('<svg ', `<svg width="${icon}" height="${icon}" `)}</div>`, icon, icon, `${dir}ic_launcher.png`, { transparent: true });
  await render(`${box(icon)}${variants.round.replace('<svg ', `<svg width="${icon}" height="${icon}" `)}</div>`, icon, icon, `${dir}ic_launcher_round.png`, { transparent: true });
  await render(`${box(fg)}${variants.foreground.replace('<svg ', `<svg width="${fg}" height="${fg}" `)}</div>`, fg, fg, `${dir}ic_launcher_foreground.png`, { transparent: true });
}

// Splash screens: logo drawing centred on the cream background, 40 % of the smallest side.
const splashes = {
  drawable: [480, 320],
  'drawable-land-mdpi': [480, 320], 'drawable-land-hdpi': [800, 480], 'drawable-land-xhdpi': [1280, 720], 'drawable-land-xxhdpi': [1600, 960], 'drawable-land-xxxhdpi': [1920, 1280],
  'drawable-port-mdpi': [320, 480], 'drawable-port-hdpi': [480, 800], 'drawable-port-xhdpi': [720, 1280], 'drawable-port-xxhdpi': [960, 1600], 'drawable-port-xxxhdpi': [1280, 1920],
};
for (const [dir, [w, h]] of Object.entries(splashes)) {
  const s = Math.round(Math.min(w, h) * 0.4);
  const markup = `<div style="width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center">${svg(centred(1)).replace('<svg ', `<svg width="${s}" height="${s}" `)}</div>`;
  await render(markup, w, h, new URL(`${dir}/splash.png`, res).pathname);
}
// PWA icons (ADR-027). "any": the rounded square logo; maskable: full-bleed background, drawing inside the 80 % safe
// circle; iOS: opaque full square (iOS rounds the corners itself and fills transparency with black).
const web = new URL('public/icons/', root);
await mkdir(web, { recursive: true });
const sized = (variant, s) => `<div style="width:${s}px;height:${s}px">${variant.replace('<svg ', `<svg width="${s}" height="${s}" `)}</div>`;
for (const s of [192, 512]) await render(sized(variants.square, s), s, s, new URL(`icon-${s}.png`, web).pathname, { transparent: true });
await render(sized(svg(centred(0.62), { background: `<rect width="512" height="512" fill="${BG}"/>` }), 512), 512, 512, new URL('icon-maskable-512.png', web).pathname);
await render(sized(svg(centred(0.86), { background: `<rect width="512" height="512" fill="${BG}"/>` }), 180), 180, 180, new URL('apple-touch-icon.png', web).pathname);
await browser.close();

// Adaptive icon background colour.
await writeFile(new URL('values/ic_launcher_background.xml', res), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG.toUpperCase()}</color>\n</resources>\n`);
// Web favicon.
await copyFile(new URL('design/logo/pupitre-dessin.svg', root), new URL('public/favicon.svg', root));
console.log('icons, splash screens, favicon and PWA icons generated');
