import type { SurfaceBlockComponent } from '@blocksuite/affine-block-surface';
import {
  addNote,
  EXCLUDING_MOUSE_OUT_CLASS_LIST,
} from '@blocksuite/affine-block-surface';
import {
  DEFAULT_NOTE_HEIGHT,
  DEFAULT_NOTE_WIDTH,
} from '@blocksuite/affine-model';
import { EditPropsStore } from '@blocksuite/affine-shared/services';
import type { NoteChildrenFlavour } from '@blocksuite/affine-shared/types';
import { hasClassNameInList } from '@blocksuite/affine-shared/utils';
import type { PointerEventState } from '@blocksuite/block-std';
import { BaseTool } from '@blocksuite/block-std/gfx';
import { Point } from '@blocksuite/global/gfx';
import { effect } from '@preact/signals-core';

import { DraggingNoteOverlay, NoteOverlay } from './overlay';

export type NoteToolOption = {
  childFlavour: NoteChildrenFlavour;
  childType: string | null;
  tip: string;
};

export class NoteTool extends BaseTool<NoteToolOption> {
  static override toolName = 'affine:note';

  private _draggingNoteOverlay: DraggingNoteOverlay | null = null;

  private _noteOverlay: NoteOverlay | null = null;

  // Ensure clear overlay before adding a new note
  private _clearOverlay() {
    this._noteOverlay = this._disposeOverlay(this._noteOverlay);
    this._draggingNoteOverlay = this._disposeOverlay(this._draggingNoteOverlay);
    (this.gfx.surfaceComponent as SurfaceBlockComponent).refresh();
  }

  private _disposeOverlay(overlay: NoteOverlay | null) {
    if (!overlay) return null;

    overlay.dispose();
    (
      this.gfx.surfaceComponent as SurfaceBlockComponent
    )?.renderer.removeOverlay(overlay);
    return null;
  }

  // Should hide overlay when mouse is out of viewport or on menu and toolbar
  private _hideOverlay() {
    if (!this._noteOverlay) return;

    this._noteOverlay.globalAlpha = 0;
    (this.gfx.surfaceComponent as SurfaceBlockComponent)?.refresh();
  }

  private _resize(shift = false) {
    const { _draggingNoteOverlay } = this;
    if (!_draggingNoteOverlay) return;

    const draggingArea = this.controller.draggingArea$.peek();
    const { startX, startY } = draggingArea;
    let { endX, endY } = this.controller.draggingArea$.peek();

    if (shift) {
      const w = Math.abs(endX - startX);
      const h = Math.abs(endY - startY);
      const m = Math.max(w, h);
      endX = startX + (endX > startX ? m : -m);
      endY = startY + (endY > startY ? m : -m);
    }

    _draggingNoteOverlay.slots.draggingNoteUpdated.next({
      xywh: [
        Math.min(startX, endX),
        Math.min(startY, endY),
        Math.abs(startX - endX),
        Math.abs(startY - endY),
      ],
    });
  }

  private _updateOverlayPosition(x: number, y: number) {
    if (!this._noteOverlay) return;
    this._noteOverlay.x = x;
    this._noteOverlay.y = y;
    (this.gfx.surfaceComponent as SurfaceBlockComponent).refresh();
  }

  override activate() {
    const attributes =
      this.std.get(EditPropsStore).lastProps$.value['affine:note'];
    const background = attributes.background;
    this._noteOverlay = new NoteOverlay(this.gfx, background);
    this._noteOverlay.text = this.activatedOption.tip;
    (this.gfx.surfaceComponent as SurfaceBlockComponent).renderer.addOverlay(
      this._noteOverlay
    );
  }

  override click(e: PointerEventState): void {
    this._clearOverlay();

    const { childFlavour, childType } = this.activatedOption;
    const options = {
      childFlavour,
      childType,
      collapse: false,
    };
    const point = new Point(e.point.x, e.point.y);
    addNote(this.std, point, options);
  }

  override deactivate() {
    this._clearOverlay();
  }

  override dragEnd() {
    if (!this._draggingNoteOverlay) return;

    const { x, y, width, height } = this._draggingNoteOverlay;

    this._disposeOverlay(this._draggingNoteOverlay);

    const { childFlavour, childType } = this.activatedOption;

    const options = {
      childFlavour,
      childType,
      collapse: true,
    };

    const [viewX, viewY] = this.gfx.viewport.toViewCoord(x, y);

    const point = new Point(viewX, viewY);

    this.doc.captureSync();

    addNote(
      this.std,
      point,
      options,
      Math.max(width, DEFAULT_NOTE_WIDTH),
      Math.max(height, DEFAULT_NOTE_HEIGHT)
    );
  }

  override dragMove(e: PointerEventState) {
    if (!this._draggingNoteOverlay) return;

    this._resize(e.keys.shift || this.gfx.keyboard.shiftKey$.peek());
  }

  override dragStart() {
    this._clearOverlay();

    const attributes =
      this.std.get(EditPropsStore).lastProps$.value['affine:note'];
    const background = attributes.background;
    this._draggingNoteOverlay = new DraggingNoteOverlay(this.gfx, background);
    (this.gfx.surfaceComponent as SurfaceBlockComponent).renderer.addOverlay(
      this._draggingNoteOverlay
    );
  }

  override mounted() {
    this.disposable.add(
      effect(() => {
        const shiftPressed = this.gfx.keyboard.shiftKey$.value;

        if (!this._draggingNoteOverlay) {
          return;
        }

        this._resize(shiftPressed);
      })
    );
  }

  override pointerMove(e: PointerEventState) {
    if (!this._noteOverlay) return;

    // if mouse is in viewport and move, update overlay pointion and show overlay
    if (this._noteOverlay.globalAlpha === 0) this._noteOverlay.globalAlpha = 1;
    const [x, y] = this.gfx.viewport.toModelCoord(e.x, e.y);
    this._updateOverlayPosition(x, y);
  }

  override pointerOut(e: PointerEventState) {
    // should not hide the overlay when pointer on the area of other notes
    if (
      e.raw.relatedTarget &&
      hasClassNameInList(
        e.raw.relatedTarget as Element,
        EXCLUDING_MOUSE_OUT_CLASS_LIST
      )
    )
      return;
    this._hideOverlay();
  }
}

declare module '@blocksuite/block-std/gfx' {
  interface GfxToolsMap {
    'affine:note': NoteTool;
  }

  interface GfxToolsOption {
    'affine:note': NoteToolOption;
  }
}
