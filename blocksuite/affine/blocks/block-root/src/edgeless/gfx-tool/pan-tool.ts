import { on } from '@blocksuite/affine-shared/utils';
import type { PointerEventState } from '@blocksuite/block-std';
import { BaseTool, MouseButton } from '@blocksuite/block-std/gfx';
import { Signal } from '@preact/signals-core';

export type PanToolOption = {
  panning: boolean;
};

export class PanTool extends BaseTool<PanToolOption> {
  static override toolName = 'pan';

  private _lastPoint: [number, number] | null = null;

  readonly panning$ = new Signal<boolean>(false);

  override get allowDragWithRightButton(): boolean {
    return true;
  }

  override dragEnd(_: PointerEventState): void {
    this._lastPoint = null;
    this.panning$.value = false;
  }

  override dragMove(e: PointerEventState): void {
    if (!this._lastPoint) return;

    const { viewport } = this.gfx;
    const { zoom } = viewport;

    const [lastX, lastY] = this._lastPoint;
    const deltaX = lastX - e.x;
    const deltaY = lastY - e.y;

    this._lastPoint = [e.x, e.y];

    viewport.applyDeltaCenter(deltaX / zoom, deltaY / zoom);
  }

  override dragStart(e: PointerEventState): void {
    this._lastPoint = [e.x, e.y];
    this.panning$.value = true;
  }

  override mounted(): void {
    this.addHook('pointerDown', evt => {
      const shouldPanWithMiddle = evt.raw.button === MouseButton.MIDDLE;

      if (!shouldPanWithMiddle) {
        return;
      }

      evt.raw.preventDefault();

      const selection = this.gfx.selection.surfaceSelections;
      const currentTool = this.controller.currentToolOption$.peek();
      const restoreToPrevious = () => {
        this.controller.setTool(currentTool);
        this.gfx.selection.set(selection);
      };

      this.controller.setTool('pan', {
        panning: true,
      });

      const dispose = on(document, 'pointerup', evt => {
        if (evt.button === MouseButton.MIDDLE) {
          restoreToPrevious();
          dispose();
        }
      });

      return false;
    });
  }
}

declare module '@blocksuite/block-std/gfx' {
  interface GfxToolsMap {
    pan: PanTool;
  }

  interface GfxToolsOption {
    pan: PanToolOption;
  }
}
