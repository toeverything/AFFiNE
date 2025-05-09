import type { Op, OpSet, ResolvedOptions } from '../core.js';
import type { Line, Point } from '../geometry.js';
import { lineLength } from '../geometry.js';
import type { PatternFiller, RenderHelper } from './filler-interface.js';
import { polygonHachureLines } from './scan-line-hachure.js';

export class DotFiller implements PatternFiller {
  private readonly helper: RenderHelper;

  constructor(helper: RenderHelper) {
    this.helper = helper;
  }

  private dotsOnLines(lines: Line[], o: ResolvedOptions): OpSet {
    const ops: Op[] = [];
    let gap = o.hachureGap;
    if (gap < 0) {
      gap = o.strokeWidth * 4;
    }
    gap = Math.max(gap, 0.1);
    let fweight = o.fillWeight;
    if (fweight < 0) {
      fweight = o.strokeWidth / 2;
    }
    const ro = gap / 4;
    for (const line of lines) {
      const length = lineLength(line);
      const dl = length / gap;
      const count = Math.ceil(dl) - 1;
      const offset = length - count * gap;
      const x = (line[0][0] + line[1][0]) / 2 - gap / 4;
      const minY = Math.min(line[0][1], line[1][1]);

      for (let i = 0; i < count; i++) {
        const y = minY + offset + i * gap;
        const cx = x - ro + Math.random() * 2 * ro;
        const cy = y - ro + Math.random() * 2 * ro;
        const el = this.helper.ellipse(cx, cy, fweight, fweight, o);
        ops.push(...el.ops);
      }
    }
    return { type: 'fillSketch', ops };
  }

  fillPolygons(polygonList: Point[][], o: ResolvedOptions): OpSet {
    o = Object.assign({}, o, { hachureAngle: 0 });
    const lines = polygonHachureLines(polygonList, o);
    return this.dotsOnLines(lines, o);
  }
}
