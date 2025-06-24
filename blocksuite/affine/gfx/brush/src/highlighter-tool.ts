import { CanvasElementType } from '@blocksuite/affine-block-surface';
import type { HighlighterElementModel } from '@blocksuite/affine-model';
import { TelemetryProvider } from '@blocksuite/affine-shared/services';
import type { IVec } from '@blocksuite/global/gfx';
import type { PointerEventState } from '@blocksuite/std';
import { BaseTool } from '@blocksuite/std/gfx';

export class HighlighterTool extends BaseTool {
  static HIGHLIGHTER_POP_GAP = 20;

  static override toolName: string = 'highlighter';

  private _draggingElement: HighlighterElementModel | null = null;

  private _draggingElementId: string | null = null;

  private _lastPoint: IVec | null = null;

  private _lastPopLength = 0;

  private readonly _pressureSupportedPointerIds = new Set<number>();

  private _straightLineType: 'horizontal' | 'vertical' | null = null;

  protected _draggingPathPoints: number[][] | null = null;

  protected _draggingPathPressures: number[] | null = null;

  private _getStraightLineType(currentPoint: IVec) {
    const lastPoint = this._lastPoint;
    if (!lastPoint) return null;

    // check angle to determine if the line is horizontal or vertical
    const dx = currentPoint[0] - lastPoint[0];
    const dy = currentPoint[1] - lastPoint[1];
    const absAngleRadius = Math.abs(Math.atan2(dy, dx));
    return absAngleRadius < Math.PI / 4 || absAngleRadius > 3 * (Math.PI / 4)
      ? 'horizontal'
      : 'vertical';
  }

  private _tryGetPressurePoints(e: PointerEventState): number[][] {
    if (!this._draggingPathPressures) {
      return [];
    }
    const pressures = [...this._draggingPathPressures, e.pressure];
    this._draggingPathPressures = pressures;

    // we do not use the `e.raw.pointerType` to detect because it is not reliable,
    // such as some digital pens do not support pressure even thought the `e.raw.pointerType` is equal to `'pen'`
    const pointerId = e.raw.pointerId;
    const pressureChanged = pressures.some(
      pressure => pressure !== pressures[0]
    );

    if (pressureChanged) {
      this._pressureSupportedPointerIds.add(pointerId);
    }

    const points = this._draggingPathPoints;
    if (!points) {
      return [];
    }
    if (this._pressureSupportedPointerIds.has(pointerId)) {
      return points.map(([x, y], i) => [x, y, pressures[i]]);
    } else {
      return points;
    }
  }

  override dragEnd() {
    if (this._draggingElement) {
      const { _draggingElement } = this;
      this.doc.withoutTransact(() => {
        _draggingElement.pop('points');
        _draggingElement.pop('xywh');
      });
    }
    this._draggingElement = null;
    this._draggingElementId = null;
    this._draggingPathPoints = null;
    this._draggingPathPressures = null;
    this._lastPoint = null;
    this._straightLineType = null;
    this.doc.captureSync();
  }

  override dragMove(e: PointerEventState) {
    if (
      !this._draggingElementId ||
      !this._draggingElement ||
      !this.gfx.surface ||
      !this._draggingPathPoints
    )
      return;

    let pointX = e.point.x;
    let pointY = e.point.y;
    const holdingShiftKey = e.keys.shift || this.gfx.keyboard.shiftKey$.peek();
    if (holdingShiftKey) {
      if (!this._straightLineType) {
        this._straightLineType = this._getStraightLineType([pointX, pointY]);
      }

      if (this._straightLineType === 'horizontal') {
        pointY = this._lastPoint?.[1] ?? pointY;
      } else if (this._straightLineType === 'vertical') {
        pointX = this._lastPoint?.[0] ?? pointX;
      }
    } else if (this._straightLineType) {
      this._straightLineType = null;
    }

    const [modelX, modelY] = this.gfx.viewport.toModelCoord(pointX, pointY);

    const points = [...this._draggingPathPoints, [modelX, modelY]];

    this._lastPoint = [pointX, pointY];
    this._draggingPathPoints = points;

    this.gfx.updateElement(this._draggingElement!, {
      points: this._tryGetPressurePoints(e),
    });

    if (
      this._lastPopLength + HighlighterTool.HIGHLIGHTER_POP_GAP <
      this._draggingElement!.points.length
    ) {
      this._lastPopLength = this._draggingElement!.points.length;
      this.doc.withoutTransact(() => {
        this._draggingElement!.pop('points');
        this._draggingElement!.pop('xywh');
      });

      this._draggingElement!.stash('points');
      this._draggingElement!.stash('xywh');
    }
  }

  override dragStart(e: PointerEventState) {
    if (!this.gfx.surface) {
      return;
    }

    this.doc.captureSync();

    const { viewport } = this.gfx;

    // create a shape block when drag start
    const [modelX, modelY] = viewport.toModelCoord(e.point.x, e.point.y);
    const points = [[modelX, modelY]];
    const id = this.gfx.surface.addElement({
      type: CanvasElementType.HIGHLIGHTER,
      points,
    });

    const element = this.gfx.getElementById(id) as HighlighterElementModel;

    element.stash('points');
    element.stash('xywh');

    this._lastPoint = [e.point.x, e.point.y];
    this._draggingElementId = id;
    this._draggingElement = element;
    this._draggingPathPoints = points;
    this._draggingPathPressures = [e.pressure];
    this._lastPopLength = 0;
  }

  override activate() {
    this.std.getOptional(TelemetryProvider)?.track('EdgelessToolPicked', {
      page: 'whiteboard editor',
      module: 'global toolbar',
      segment: 'global toolbar',
      control: 'drawing',
      type: CanvasElementType.HIGHLIGHTER,
    });
  }
}
