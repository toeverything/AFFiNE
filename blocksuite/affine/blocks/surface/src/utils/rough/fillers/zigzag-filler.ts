import type { OpSet, ResolvedOptions } from '../core.js';
import type { Line, Point } from '../geometry.js';
import { lineLength } from '../geometry.js';
import { HachureFiller } from './hachure-filler.js';
import { polygonHachureLines } from './scan-line-hachure.js';

export class ZigZagFiller extends HachureFiller {
  override fillPolygons(polygonList: Point[][], o: ResolvedOptions): OpSet {
    let gap = o.hachureGap;
    if (gap < 0) {
      gap = o.strokeWidth * 4;
    }
    gap = Math.max(gap, 0.1);
    const o2 = Object.assign({}, o, { hachureGap: gap });
    const lines = polygonHachureLines(polygonList, o2);
    const zigZagAngle = (Math.PI / 180) * o.hachureAngle;
    const zigzagLines: Line[] = [];
    const dgx = gap * 0.5 * Math.cos(zigZagAngle);
    const dgy = gap * 0.5 * Math.sin(zigZagAngle);
    for (const [p1, p2] of lines) {
      if (lineLength([p1, p2])) {
        zigzagLines.push(
          [[p1[0] - dgx, p1[1] + dgy], [...p2]],
          [[p1[0] + dgx, p1[1] - dgy], [...p2]]
        );
      }
    }
    const ops = this.renderLines(zigzagLines, o);
    return { type: 'fillSketch', ops };
  }
}
