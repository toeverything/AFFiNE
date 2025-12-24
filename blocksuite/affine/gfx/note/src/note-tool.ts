import {
  DEFAULT_NOTE_OFFSET_X,
  DEFAULT_NOTE_OFFSET_Y,
  DefaultTool,
  EdgelessCRUDIdentifier,
  EXCLUDING_MOUSE_OUT_CLASS_LIST,
  type SurfaceBlockComponent,
} from '@blocksuite/affine-block-surface';
import {
  DEFAULT_NOTE_HEIGHT,
  DEFAULT_NOTE_WIDTH,
  NOTE_MIN_HEIGHT,
  type NoteBlockModel,
  NoteDisplayMode,
} from '@blocksuite/affine-model';
import { focusTextModel } from '@blocksuite/affine-rich-text';
import {
  EditPropsStore,
  TelemetryProvider,
} from '@blocksuite/affine-shared/services';
import type { NoteChildrenFlavour } from '@blocksuite/affine-shared/types';
import {
  handleNativeRangeAtPoint,
  hasClassNameInList,
} from '@blocksuite/affine-shared/utils';
import { type IPoint, Point, serializeXYWH } from '@blocksuite/global/gfx';
import type { BlockStdScope, PointerEventState } from '@blocksuite/std';
import {
  BaseTool,
  type GfxBlockElementModel,
  GfxControllerIdentifier,
} from '@blocksuite/std/gfx';
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

  private get _surfaceComponent() {
    return this.gfx.surfaceComponent as SurfaceBlockComponent | null;
  }

  // Ensure clear overlay before adding a new note
  private _clearOverlay() {
    this._noteOverlay = this._disposeOverlay(this._noteOverlay);
    this._draggingNoteOverlay = this._disposeOverlay(this._draggingNoteOverlay);
    this._surfaceComponent?.refresh();
  }

  private _disposeOverlay(overlay: NoteOverlay | null) {
    if (!overlay) return null;

    overlay.dispose();
    this._surfaceComponent?.renderer.removeOverlay(overlay);
    return null;
  }

  // Should hide overlay when mouse is out of viewport or on menu and toolbar
  private _hideOverlay() {
    if (!this._noteOverlay) return;

    this._noteOverlay.globalAlpha = 0;
    this._surfaceComponent?.refresh();
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
    this._surfaceComponent?.refresh();
  }

  override activate() {
    const attributes =
      this.std.get(EditPropsStore).lastProps$.value['affine:note'];
    const background = attributes.background;
    this._noteOverlay = new NoteOverlay(this.gfx, background);
    this._noteOverlay.text = this.activatedOption.tip;
    this._surfaceComponent?.renderer.addOverlay(this._noteOverlay);
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
    this._surfaceComponent?.renderer.addOverlay(this._draggingNoteOverlay);
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

type NoteOptions = {
  childFlavour: NoteChildrenFlavour;
  childType: string | null;
  collapse: boolean;
};
function addNote(
  std: BlockStdScope,
  point: Point,
  options: NoteOptions,
  width = DEFAULT_NOTE_WIDTH,
  height = DEFAULT_NOTE_HEIGHT
) {
  const noteId = addNoteAtPoint(std, point, {
    width,
    height,
  });

  const gfx = std.get(GfxControllerIdentifier);
  const doc = std.store;

  const blockId = doc.addBlock(
    options.childFlavour,
    { type: options.childType },
    noteId
  );
  if (options.collapse && height > NOTE_MIN_HEIGHT) {
    const note = doc.getModelById(noteId) as NoteBlockModel;
    doc.updateBlock(note, () => {
      note.props.edgeless.collapse = true;
      note.props.edgeless.collapsedHeight = height;
    });
  }
  gfx.tool.setTool(DefaultTool);

  // Wait for edgelessTool updated
  requestAnimationFrame(() => {
    const blocks =
      (doc.root?.children.filter(
        child => child.flavour === 'affine:note'
      ) as GfxBlockElementModel[]) ?? [];
    const element = blocks.find(b => b.id === noteId);
    if (element) {
      gfx.selection.set({
        elements: [element.id],
        editing: true,
      });

      // Waiting dom updated, `note mask` is removed
      if (blockId) {
        focusTextModel(gfx.std, blockId);
      } else {
        // Cannot reuse `handleNativeRangeClick` directly here,
        // since `retargetClick` will re-target to pervious editor
        handleNativeRangeAtPoint(point.x, point.y);
      }
    }
  });
}

function addNoteAtPoint(
  std: BlockStdScope,
  /**
   * The point is in browser coordinate
   */
  point: IPoint,
  options: {
    width?: number;
    height?: number;
    parentId?: string;
    noteIndex?: number;
    offsetX?: number;
    offsetY?: number;
    scale?: number;
  } = {}
) {
  const gfx = std.get(GfxControllerIdentifier);
  const crud = std.get(EdgelessCRUDIdentifier);
  const {
    width = DEFAULT_NOTE_WIDTH,
    height = DEFAULT_NOTE_HEIGHT,
    offsetX = DEFAULT_NOTE_OFFSET_X,
    offsetY = DEFAULT_NOTE_OFFSET_Y,
    parentId = gfx.doc.root?.id,
    noteIndex,
    scale = 1,
  } = options;
  const [x, y] = gfx.viewport.toModelCoord(point.x, point.y);
  const blockId = crud.addBlock(
    'affine:note',
    {
      xywh: serializeXYWH(
        x - offsetX * scale,
        y - offsetY * scale,
        width,
        height
      ),
      displayMode: NoteDisplayMode.EdgelessOnly,
    },
    parentId,
    noteIndex
  );

  std.getOptional(TelemetryProvider)?.track('CanvasElementAdded', {
    control: 'canvas:draw',
    page: 'whiteboard editor',
    module: 'toolbar',
    segment: 'toolbar',
    type: 'note',
  });

  return blockId;
}
