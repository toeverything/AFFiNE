import {
  getSurfaceComponent,
  Overlay,
  type RoughCanvas,
} from '@blocksuite/affine-block-surface';
import { shapeMethods, type ShapeType } from '@blocksuite/affine-model';
import { type Direction } from '@blocksuite/affine-widget-edgeless-selected-rect';
import type { Bound, IVec } from '@blocksuite/global/gfx';
import type { GfxController } from '@blocksuite/std/gfx';

/**
 * Overlay for showing shape preview when using keyboard shortcuts
 */
export class ShapePreviewOverlay extends Overlay {
  private readonly _previewShapes: Map<
    Direction,
    {
      bound: Bound;
      shapeType: ShapeType;
      stroke: string;
      connectorPath?: IVec[];
      originalBound?: Bound;
    }
  > = new Map();

  constructor(gfx: GfxController) {
    super(gfx);
  }

  /**
   * Add a preview shape in the specified direction
   */
  addPreviewShape(
    direction: Direction,
    bound: Bound,
    shapeType: ShapeType,
    stroke: string,
    connectorPath?: IVec[],
    originalBound?: Bound
  ) {
    this._previewShapes.set(direction, {
      bound,
      shapeType,
      stroke,
      connectorPath,
      originalBound,
    });
    this._refreshSurface();
  }

  /**
   * Remove preview shape in the specified direction
   */
  removePreviewShape(direction: Direction) {
    this._previewShapes.delete(direction);
    this._refreshSurface();
  }

  /**
   * Clear all preview shapes
   */
  clearAllPreviews() {
    this._previewShapes.clear();
    this._refreshSurface();
  }

  /**
   * Check if there are any preview shapes
   */
  hasPreviewShapes(): boolean {
    return this._previewShapes.size > 0;
  }

  private _refreshSurface() {
    const surface = getSurfaceComponent(this.gfx.std);
    if (surface) {
      surface.refresh();
    }
  }

  override render(ctx: CanvasRenderingContext2D, _rc: RoughCanvas) {
    if (this._previewShapes.size === 0) return;

    this._previewShapes.forEach(
      ({ bound, shapeType, stroke, connectorPath }) => {
        ctx.save();

        // Set dashed line style for preview shapes
        ctx.setLineDash([4, 4]);
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.fillStyle = 'transparent';

        // Draw the connector path first if it exists
        if (connectorPath && connectorPath.length > 1) {
          ctx.beginPath();
          ctx.moveTo(connectorPath[0][0], connectorPath[0][1]);
          for (let i = 1; i < connectorPath.length; i++) {
            ctx.lineTo(connectorPath[i][0], connectorPath[i][1]);
          }
          ctx.stroke();
        }

        // Draw the preview shape using the shape methods
        shapeMethods[shapeType].draw(ctx, {
          x: bound.x,
          y: bound.y,
          w: bound.w,
          h: bound.h,
          rotate: 0,
        });

        // Stroke the path
        ctx.stroke();

        ctx.restore();
      }
    );
  }
}
