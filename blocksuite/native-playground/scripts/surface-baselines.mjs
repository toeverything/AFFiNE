import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const fonts = [
  ['IBM Plex Mono', '../../packages/frontend/component/src/fonts/ibm-plex-mono/IBMPlexMono-Regular.ttf'],
  ['Surface Metrics Test', 'tokens/surface-metrics-test.ttf'],
];

// Measure the same inline span and containing line box as the surface text renderer.
export async function measureSurfaceBaselines(evaluate) {
  const result = [];
  for (const [font, file] of fonts) {
    const data = fs.readFileSync(new URL(file, root)).toString('base64');
    const metrics = await evaluate(`(async () => {
      const face = await new FontFace('OracleFace', 'url(data:font/ttf;base64,${data})').load();
      document.fonts.add(face);
      const div = document.createElement('div');
      div.style.cssText = 'position:absolute;visibility:hidden;font:40px OracleFace;line-height:normal';
      const span = document.createElement('span');
      span.textContent = 'x';
      div.append(span);
      document.body.append(div);
      const spanHeight = span.getBoundingClientRect().height;
      const gap = div.getBoundingClientRect().height - spanHeight;
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = '40px OracleFace';
      const ascent = ctx.measureText('x').fontBoundingBoxAscent;
      div.remove();
      document.fonts.delete(face);
      return { spanHeight, gap, ascent };
    })()`);
    const {spanHeight, gap, ascent} = metrics;
    for (const height of [180, 85]) {
      const first = Math.max(10, (height - 2 * (spanHeight + gap)) / 2) + ascent + gap / 2;
      result.push({font, fontSize:40, height, ...metrics, lines:[first, first + spanHeight]});
    }
  }
  return result;
}
