import type { Op, OpSet, ResolvedOptions } from '../core.js';
import type { Point } from '../geometry.js';

export interface PatternFiller {
  fillPolygons(polygonList: Point[][], o: ResolvedOptions): OpSet;
}

export interface RenderHelper {
  randOffset(x: number, o: ResolvedOptions): number;
  randOffsetWithRange(min: number, max: number, o: ResolvedOptions): number;
  ellipse(
    x: number,
    y: number,
    width: number,
    height: number,
    o: ResolvedOptions
  ): OpSet;
  doubleLineOps(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    o: ResolvedOptions
  ): Op[];
}
