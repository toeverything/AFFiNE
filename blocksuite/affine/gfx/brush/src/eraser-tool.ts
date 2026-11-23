import {
  EdgelessCRUDIdentifier,
  Overlay,
  type SurfaceBlockComponent,
} from '@blocksuite/affine-block-surface';
import { isTopLevelBlock } from '@blocksuite/affine-shared/utils';
import {
  Bound,
  getStroke,
  getSvgPathFromStroke,
  type IVec,
  linePolygonIntersects,
} from '@blocksuite/global/gfx';
import type { PointerEventState } from '@blocksuite/std';
import { BaseTool, type GfxModel } from '@blocksuite/std/gfx';

class EraserOverlay extends Overlay {
  d = '';

  override render(ctx: CanvasRenderingContext2D): void {
    ctx.globalAlpha = 0.33;
    const path = new Path2D(this.d);
    ctx.fillStyle = '#aaa';
    ctx.fill(path);
  }
}

export class EraserTool extends BaseTool {
  static override toolName = 'eraser';

  private _erasable = new Set<GfxModel>();

  private _eraserPoints: IVec[] = [];

  private readonly _eraseTargets = new Set<GfxModel>();

  private get _surfaceComponent() {
    return this.gfx.surfaceComponent as SurfaceBlockComponent | null;
  }

  private readonly _loop = () => {
    const now = Date.now();
    const elapsed = now - this._timestamp;

    let didUpdate = false;

    if (this._prevEraserPoint !== this._prevPoint) {
      didUpdate = true;
      this._eraserPoints.push(this._prevPoint);
      this._prevEraserPoint = this._prevPoint;
    }
    if (elapsed > 32 && this._eraserPoints.length > 1) {
      didUpdate = true;
      this._eraserPoints.splice(0, Math.ceil(this._eraserPoints.length * 0.1));
      this._timestamp = now;
    }
    if (didUpdate) {
      const zoom = this.gfx.viewport.zoom;
      const d = getSvgPathFromStroke(
        getStroke(this._eraserPoints, {
          size: 16 / zoom,
          start: { taper: true },
        })
      );
      this._overlay.d = d;
      this._surfaceComponent?.refresh();
    }
    this._timer = requestAnimationFrame(this._loop);
  };

  private readonly _overlay = new EraserOverlay(this.gfx);

  private _prevEraserPoint: IVec = [0, 0];

  private _prevPoint: IVec = [0, 0];

  private _timer = 0;

  private _timestamp = 0;

  private _reset() {
    cancelAnimationFrame(this._timer);

    if (!this.gfx.surface) {
      return;
    }

    this._surfaceComponent?.renderer.removeOverlay(this._overlay);
    this._erasable.clear();
    this._eraseTargets.clear();
  }

  override activate(): void {
    this._eraseTargets.forEach(erasable => {
      if (isTopLevelBlock(erasable)) {
        const ele = this.std.view.getBlock(erasable.id);
        ele && ((ele as HTMLElement).style.opacity = '1');
      } else {
        erasable.opacity = 1;
      }
    });
    this._reset();
  }

  override dragEnd(_: PointerEventState): void {
    this.gfx.std
      .get(EdgelessCRUDIdentifier)
      .deleteElements(Array.from(this._eraseTargets));
    this._reset();
    this.doc.captureSync();
  }

  override dragMove(e: PointerEventState): void {
    const currentPoint = this.gfx.viewport.toModelCoord(e.point.x, e.point.y);
    this._erasable.forEach(erasable => {
      if (erasable.isLocked()) return;
      if (this._eraseTargets.has(erasable)) return;
      if (isTopLevelBlock(erasable)) {
        const bound = Bound.deserialize(erasable.xywh);
        if (
          linePolygonIntersects(this._prevPoint, currentPoint, bound.points)
        ) {
          this._eraseTargets.add(erasable);
          const ele = this.std.view.getBlock(erasable.id);
          ele && ((ele as HTMLElement).style.opacity = '0.3');
        }
      } else {
        if (
          erasable.getLineIntersections(
            this._prevPoint as IVec,
            currentPoint as IVec
          )
        ) {
          this._eraseTargets.add(erasable);
          erasable.opacity = 0.3;
        }
      }
    });

    this._prevPoint = currentPoint;
  }

  override dragStart(e: PointerEventState): void {
    this.doc.captureSync();

    const { point } = e;
    const [x, y] = this.gfx.viewport.toModelCoord(point.x, point.y);
    this._eraserPoints = [[x, y]];
    this._prevPoint = [x, y];
    this._erasable = new Set([
      ...this.gfx.layer.canvasElements,
      ...this.gfx.layer.blocks,
    ]);
    this._loop();

    this._surfaceComponent?.renderer.addOverlay(this._overlay);
  }
}
