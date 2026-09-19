import {
  DefaultTool,
  EdgelessLegacySlotIdentifier,
} from '@blocksuite/affine-block-surface';
import { on } from '@blocksuite/affine-shared/utils';
import { IS_IPAD } from '@blocksuite/global/env';
import { isPencilInputActive, type PointerEventState } from '@blocksuite/std';
import {
  BaseTool,
  createRafCoalescer,
  MouseButton,
  type ToolOptions,
} from '@blocksuite/std/gfx';
import { Signal } from '@preact/signals-core';

/**
 * Tools whose drag creates freehand/graphical content. On iPad, while an Apple
 * Pencil is the active instrument, a finger drag over one of these should pan
 * the canvas instead of drawing (Pencil draws, finger navigates).
 */
const IPAD_FINGER_PAN_TOOLS = new Set([
  'brush',
  'highlighter',
  'eraser',
  'shape',
  'connector',
]);

interface RestorablePresentToolOptions {
  mode?: string; // 'fit' | 'fill', simplified to string for local use
  restoredAfterPan?: boolean;
}

export type PanToolOption = {
  panning: boolean;
};

export class PanTool extends BaseTool<PanToolOption> {
  static override toolName = 'pan';

  private _lastPoint: [number, number] | null = null;

  private _pendingDelta: [number, number] = [0, 0];

  /**
   * Tracks an in-flight iPad finger pan (Pencil-priority routing). Non-null only
   * while a finger drag is being rerouted from a drawing tool to a canvas pan.
   */
  private _iPadFingerPanLast: [number, number] | null = null;

  private readonly _deltaFlushCoalescer = createRafCoalescer<void>(() => {
    this._flushPendingDelta();
  });

  readonly panning$ = new Signal<boolean>(false);

  private _flushPendingDelta() {
    if (this._pendingDelta[0] === 0 && this._pendingDelta[1] === 0) {
      return;
    }

    const [deltaX, deltaY] = this._pendingDelta;
    this._pendingDelta = [0, 0];
    this.gfx.viewport.applyDeltaCenter(deltaX, deltaY);
  }

  override get allowDragWithRightButton(): boolean {
    return true;
  }

  override dragEnd(_: PointerEventState): void {
    this._deltaFlushCoalescer.flush();
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
    this._pendingDelta[0] += deltaX / zoom;
    this._pendingDelta[1] += deltaY / zoom;
    this._deltaFlushCoalescer.schedule(undefined);
  }

  override dragStart(e: PointerEventState): void {
    this._lastPoint = [e.x, e.y];
    this._pendingDelta = [0, 0];
    this.panning$.value = true;
  }

  /**
   * iPad Pencil-priority routing: while an Apple Pencil is the active drawing
   * instrument and a drawing tool is selected, a finger drag should pan the
   * canvas rather than draw. The Pencil itself (pointerType 'pen') and non-iPad
   * platforms are untouched; palms are already discarded upstream in the
   * pointer dispatcher.
   */
  private _shouldFingerPan(e: PointerEventState): boolean {
    if (!IS_IPAD) return false;
    if (e.raw.pointerType !== 'touch') return false;
    if (!isPencilInputActive()) return false;
    return IPAD_FINGER_PAN_TOOLS.has(this.controller.currentToolName$.peek());
  }

  private _mountIPadFingerPan(): void {
    this.addHook('dragStart', evt => {
      if (!this._shouldFingerPan(evt)) return;
      this._iPadFingerPanLast = [evt.x, evt.y];
      this._pendingDelta = [0, 0];
      // Suppress the drawing tool for this finger drag.
      return false;
    });

    this.addHook('dragMove', evt => {
      if (!this._iPadFingerPanLast) return;

      const { viewport } = this.gfx;
      const [lastX, lastY] = this._iPadFingerPanLast;
      this._iPadFingerPanLast = [evt.x, evt.y];
      // Coalesce like PanTool.dragMove — Pencil/finger streams are high-rate
      // and synchronous applyDeltaCenter per event still churns setCenter.
      this._pendingDelta[0] += (lastX - evt.x) / viewport.zoom;
      this._pendingDelta[1] += (lastY - evt.y) / viewport.zoom;
      this._deltaFlushCoalescer.schedule(undefined);
      return false;
    });

    this.addHook('dragEnd', () => {
      if (!this._iPadFingerPanLast) return;
      this._deltaFlushCoalescer.flush();
      this._iPadFingerPanLast = null;
      return false;
    });
  }

  override mounted(): void {
    this._mountIPadFingerPan();

    this.addHook('pointerDown', evt => {
      const shouldPanWithMiddle = evt.raw.button === MouseButton.MIDDLE;

      if (!shouldPanWithMiddle) {
        return;
      }

      const currentTool = this.controller.currentToolOption$.peek();
      const { toolType, options: originalToolOptions } = currentTool;

      if (toolType?.toolName === PanTool.toolName) {
        return;
      }

      evt.raw.preventDefault();

      const selectionToRestore = this.gfx.selection.surfaceSelections.slice();

      const restoreToPrevious = () => {
        this.gfx.selection.set(selectionToRestore);

        if (!toolType) return;
        // restore to DefaultTool if previous tool is CopilotTool
        if (toolType.toolName === 'copilot') {
          this.controller.setTool(DefaultTool);
          return;
        }

        let finalOptions: ToolOptions<BaseTool<any>> | undefined =
          originalToolOptions;
        if (toolType.toolName === 'frameNavigator') {
          // When restoring PresentTool (frameNavigator) after a temporary pan (e.g., via middle mouse button),
          // set 'restoredAfterPan' to true. This allows PresentTool to avoid an unwanted viewport reset
          // and maintain the panned position.
          const currentPresentOptions = originalToolOptions as
            | RestorablePresentToolOptions
            | undefined;
          finalOptions = {
            ...currentPresentOptions,
            restoredAfterPan: true,
          } as RestorablePresentToolOptions;
        }
        this.controller.setTool(toolType, finalOptions);
      };

      // If in presentation mode, disable black background after middle mouse drag
      if (toolType?.toolName === 'frameNavigator') {
        const slots = this.std.get(EdgelessLegacySlotIdentifier);
        slots.navigatorSettingUpdated.next({
          blackBackground: false,
        });
      }

      this.controller.setTool(PanTool, {
        panning: true,
      });

      const dispose = on(document, 'pointerup', evt => {
        if (evt.button === MouseButton.MIDDLE) {
          restoreToPrevious();
        }
        dispose();
      });

      return false;
    });
  }

  override unmounted(): void {
    this._deltaFlushCoalescer.cancel();
  }
}
