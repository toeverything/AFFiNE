import type { Op, OpSet, ResolvedOptions } from '../core.js';
import type { Line, Point } from '../geometry.js';
import type { PatternFiller, RenderHelper } from './filler-interface.js';
import { polygonHachureLines } from './scan-line-hachure.js';

export class HachureFiller implements PatternFiller {
  private readonly helper: RenderHelper;

  constructor(helper: RenderHelper) {
    this.helper = helper;
  }

  protected _fillPolygons(polygonList: Point[][], o: ResolvedOptions): OpSet {
    const lines = polygonHachureLines(polygonList, o);
    const ops = this.renderLines(lines, o);
    return { type: 'fillSketch', ops };
  }

  fillPolygons(polygonList: Point[][], o: ResolvedOptions): OpSet {
    return this._fillPolygons(polygonList, o);
  }

  protected renderLines(lines: Line[], o: ResolvedOptions): Op[] {
    const ops: Op[] = [];
    for (const line of lines) {
      ops.push(
        ...this.helper.doubleLineOps(
          line[0][0],
          line[0][1],
          line[1][0],
          line[1][1],
          o
        )
      );
    }
    return ops;
  }
}
