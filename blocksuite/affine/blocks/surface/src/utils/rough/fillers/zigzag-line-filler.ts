import type { Op, OpSet, ResolvedOptions } from '../core.js';
import type { Line, Point } from '../geometry.js';
import { lineLength } from '../geometry.js';
import type { PatternFiller, RenderHelper } from './filler-interface.js';
import { polygonHachureLines } from './scan-line-hachure.js';

export class ZigZagLineFiller implements PatternFiller {
  private readonly helper: RenderHelper;

  constructor(helper: RenderHelper) {
    this.helper = helper;
  }

  private zigzagLines(lines: Line[], zo: number, o: ResolvedOptions): Op[] {
    const ops: Op[] = [];
    lines.forEach(line => {
      const length = lineLength(line);
      const count = Math.round(length / (2 * zo));
      let p1 = line[0];
      let p2 = line[1];
      if (p1[0] > p2[0]) {
        p1 = line[1];
        p2 = line[0];
      }
      const alpha = Math.atan((p2[1] - p1[1]) / (p2[0] - p1[0]));
      for (let i = 0; i < count; i++) {
        const lstart = i * 2 * zo;
        const lend = (i + 1) * 2 * zo;
        const dz = Math.sqrt(2 * Math.pow(zo, 2));
        const start: Point = [
          p1[0] + lstart * Math.cos(alpha),
          p1[1] + lstart * Math.sin(alpha),
        ];
        const end: Point = [
          p1[0] + lend * Math.cos(alpha),
          p1[1] + lend * Math.sin(alpha),
        ];
        const middle: Point = [
          start[0] + dz * Math.cos(alpha + Math.PI / 4),
          start[1] + dz * Math.sin(alpha + Math.PI / 4),
        ];
        ops.push(
          ...this.helper.doubleLineOps(
            start[0],
            start[1],
            middle[0],
            middle[1],
            o
          ),
          ...this.helper.doubleLineOps(middle[0], middle[1], end[0], end[1], o)
        );
      }
    });
    return ops;
  }

  fillPolygons(polygonList: Point[][], o: ResolvedOptions): OpSet {
    const gap = o.hachureGap < 0 ? o.strokeWidth * 4 : o.hachureGap;
    const zo = o.zigzagOffset < 0 ? gap : o.zigzagOffset;
    o = Object.assign({}, o, { hachureGap: gap + zo });
    const lines = polygonHachureLines(polygonList, o);
    return { type: 'fillSketch', ops: this.zigzagLines(lines, zo, o) };
  }
}
