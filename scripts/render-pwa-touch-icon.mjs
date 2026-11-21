// Renders the PWA apple-touch icon from the AFFiNE logo SVG (crisp, any size).
//
// usage (from the repo root):
//   BADGE=heart node scripts/render-pwa-touch-icon.mjs \
//     packages/frontend/admin/src/modules/auth/logo.svg \
//     packages/frontend/core/public/apple-touch-icon-v2.png 180 "63 20 343 343"
//
// args: <svgPath> <outPng> <size> [viewBox]  -- viewBox "63 20 343 343" crops
// the logo SVG to the triangle mark (without the wordmark).
// BADGE=heart adds the green heart that distinguishes this build from the
// official AFFiNE iOS app.
import { readFileSync } from 'node:fs';

import { chromium } from 'playwright';
const [, , svgPath, out, sizeArg] = process.argv;
const size = Number(sizeArg);
const viewBox = process.argv[5];
let svg = readFileSync(svgPath, 'utf8').replace(/<\?xml[^>]*>/, '');
if (viewBox) svg = svg.replace(/viewBox="[^"]*"/, `viewBox="${viewBox}"`);
// Full-bleed opaque background (iOS masks the corners itself and renders
// transparency as black); faint grid echoing the existing icon design.
const grid = size / 8;
const html = `<!doctype html><html><body style="margin:0">
<div style="width:${size}px;height:${size}px;background:#fff;
  background-image:linear-gradient(#e6e6e6 1px,transparent 1px),linear-gradient(90deg,#e6e6e6 1px,transparent 1px);
  background-size:${grid}px ${grid}px;background-position:${grid / 2}px ${grid / 2}px;
  display:flex;align-items:center;justify-content:center;position:relative">
  <div style="width:${Math.round(size * 0.62)}px;height:${Math.round(size * 0.62)}px;display:flex">${svg}</div>
  ${
    process.env.BADGE === 'heart'
      ? `<svg viewBox="0 0 24 24" style="position:absolute;right:${Math.round(size * 0.07)}px;bottom:${Math.round(size * 0.07)}px;width:${Math.round(size * 0.3)}px;height:${Math.round(size * 0.3)}px">
    <path d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
      fill="#22c55e" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round"/></svg>`
      : ''
  }
</div></body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: size, height: size },
  deviceScaleFactor: 1,
});
await page.setContent(html);
await page.addStyleTag({ content: 'svg{width:100%;height:100%}' });
await page.screenshot({
  path: out,
  clip: { x: 0, y: 0, width: size, height: size },
});
await browser.close();
console.log('wrote', out);
