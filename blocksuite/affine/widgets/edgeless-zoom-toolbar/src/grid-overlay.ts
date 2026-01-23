import { Overlay } from '@blocksuite/affine-block-surface';
import { signal } from '@preact/signals-core';

/**
 * Grid overlay for the edgeless canvas.
 * Renders a visual grid to help with alignment and positioning.
 */
export class GridOverlay extends Overlay {
  static override overlayName: string = 'affine-grid-overlay';

  // Grid visibility state
  static visible$ = signal(false);

  // Grid size in pixels
  static gridSize$ = signal(20);

  override render(ctx: CanvasRenderingContext2D): void {
    if (!GridOverlay.visible$.value) return;

    const { viewport } = this.gfx;
    const { zoom, viewportBounds } = viewport;
    const gridSize = GridOverlay.gridSize$.value;

    // Calculate the effective grid size based on zoom
    const effectiveGridSize = gridSize;

    // Only render grid if it would be visible (not too dense)
    if (effectiveGridSize * zoom < 4) return;

    const { x: viewX, y: viewY, w: viewW, h: viewH } = viewportBounds;

    // Calculate the starting point (snap to grid)
    const startX = Math.floor(viewX / effectiveGridSize) * effectiveGridSize;
    const startY = Math.floor(viewY / effectiveGridSize) * effectiveGridSize;
    const endX = viewX + viewW;
    const endY = viewY + viewH;

    ctx.save();
    ctx.strokeStyle = 'var(--affine-border-color, rgba(0, 0, 0, 0.1))';
    ctx.lineWidth = 1 / zoom;

    // Draw vertical lines
    ctx.beginPath();
    for (let x = startX; x <= endX; x += effectiveGridSize) {
      ctx.moveTo(x, viewY);
      ctx.lineTo(x, viewY + viewH);
    }

    // Draw horizontal lines
    for (let y = startY; y <= endY; y += effectiveGridSize) {
      ctx.moveTo(viewX, y);
      ctx.lineTo(viewX + viewW, y);
    }
    ctx.stroke();

    // Draw thicker lines for major grid (every 5 cells)
    const majorGridSize = effectiveGridSize * 5;
    if (majorGridSize * zoom >= 20) {
      const majorStartX = Math.floor(viewX / majorGridSize) * majorGridSize;
      const majorStartY = Math.floor(viewY / majorGridSize) * majorGridSize;

      ctx.strokeStyle = 'var(--affine-border-color, rgba(0, 0, 0, 0.2))';
      ctx.lineWidth = 1.5 / zoom;

      ctx.beginPath();
      for (let x = majorStartX; x <= endX; x += majorGridSize) {
        ctx.moveTo(x, viewY);
        ctx.lineTo(x, viewY + viewH);
      }

      for (let y = majorStartY; y <= endY; y += majorGridSize) {
        ctx.moveTo(viewX, y);
        ctx.lineTo(viewX + viewW, y);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  static setVisible(visible: boolean) {
    GridOverlay.visible$.value = visible;
  }

  static setGridSize(size: number) {
    GridOverlay.gridSize$.value = size;
  }
}
