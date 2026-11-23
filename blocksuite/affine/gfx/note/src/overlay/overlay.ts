import {
  getSurfaceComponent,
  ToolOverlay,
} from '@blocksuite/affine-block-surface';
import { type Color, DefaultTheme } from '@blocksuite/affine-model';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import type { XYWH } from '@blocksuite/global/gfx';
import type { GfxController } from '@blocksuite/std/gfx';
import { effect } from '@preact/signals-core';
import { Subject } from 'rxjs';

import type { NoteTool } from '../note-tool';
import {
  NOTE_OVERLAY_CORNER_RADIUS,
  NOTE_OVERLAY_HEIGHT,
  NOTE_OVERLAY_OFFSET_X,
  NOTE_OVERLAY_OFFSET_Y,
  NOTE_OVERLAY_STOKE_COLOR,
  NOTE_OVERLAY_TEXT_COLOR,
  NOTE_OVERLAY_WIDTH,
} from './consts.js';

export class NoteOverlay extends ToolOverlay {
  backgroundColor = 'transparent';

  text = '';

  constructor(gfx: GfxController, background: Color) {
    super(gfx);
    this.backgroundColor = gfx.std
      .get(ThemeProvider)
      .getColorValue(background, DefaultTheme.noteBackgrounColor, true);
    this.disposables.add(
      effect(() => {
        // when change note child type, update overlay text
        if (this.gfx.tool.currentToolName$.value !== 'affine:note') return;
        const tool = this.gfx.tool.currentTool$.peek() as NoteTool;
        this.text = this._getOverlayText(tool.activatedOption.tip);
        const surface = getSurfaceComponent(this.gfx.std);
        surface?.refresh();
      })
    );
  }

  private _getOverlayText(text: string): string {
    return text[0].toUpperCase() + text.slice(1);
  }

  override render(ctx: CanvasRenderingContext2D): void {
    ctx.globalAlpha = this.globalAlpha;
    const overlayX = this.x + NOTE_OVERLAY_OFFSET_X;
    const overlayY = this.y + NOTE_OVERLAY_OFFSET_Y;
    ctx.strokeStyle = this.gfx.std
      .get(ThemeProvider)
      .getCssVariableColor(NOTE_OVERLAY_STOKE_COLOR);
    // Draw the overlay rectangle
    ctx.fillStyle = this.backgroundColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(overlayX + NOTE_OVERLAY_CORNER_RADIUS, overlayY);
    ctx.lineTo(
      overlayX + NOTE_OVERLAY_WIDTH - NOTE_OVERLAY_CORNER_RADIUS,
      overlayY
    );
    ctx.quadraticCurveTo(
      overlayX + NOTE_OVERLAY_WIDTH,
      overlayY,
      overlayX + NOTE_OVERLAY_WIDTH,
      overlayY + NOTE_OVERLAY_CORNER_RADIUS
    );
    ctx.lineTo(
      overlayX + NOTE_OVERLAY_WIDTH,
      overlayY + NOTE_OVERLAY_HEIGHT - NOTE_OVERLAY_CORNER_RADIUS
    );
    ctx.quadraticCurveTo(
      overlayX + NOTE_OVERLAY_WIDTH,
      overlayY + NOTE_OVERLAY_HEIGHT,
      overlayX + NOTE_OVERLAY_WIDTH - NOTE_OVERLAY_CORNER_RADIUS,
      overlayY + NOTE_OVERLAY_HEIGHT
    );
    ctx.lineTo(
      overlayX + NOTE_OVERLAY_CORNER_RADIUS,
      overlayY + NOTE_OVERLAY_HEIGHT
    );
    ctx.quadraticCurveTo(
      overlayX,
      overlayY + NOTE_OVERLAY_HEIGHT,
      overlayX,
      overlayY + NOTE_OVERLAY_HEIGHT - NOTE_OVERLAY_CORNER_RADIUS
    );
    ctx.lineTo(overlayX, overlayY + NOTE_OVERLAY_CORNER_RADIUS);
    ctx.quadraticCurveTo(
      overlayX,
      overlayY,
      overlayX + NOTE_OVERLAY_CORNER_RADIUS,
      overlayY
    );
    ctx.closePath();
    ctx.stroke();
    ctx.fill();

    // Draw the overlay text
    ctx.fillStyle = this.gfx.std
      .get(ThemeProvider)
      .getCssVariableColor(NOTE_OVERLAY_TEXT_COLOR);
    let fontSize = 16;
    ctx.font = `${fontSize}px Arial`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // measure the width of the text
    // if the text is wider than the rectangle, reduce the maximum width of the text
    while (ctx.measureText(this.text).width > NOTE_OVERLAY_WIDTH - 20) {
      fontSize -= 1;
      ctx.font = `${fontSize}px Arial`;
    }

    ctx.fillText(this.text, overlayX + 10, overlayY + NOTE_OVERLAY_HEIGHT / 2);
  }
}

export class DraggingNoteOverlay extends NoteOverlay {
  height: number;

  slots: {
    draggingNoteUpdated: Subject<{ xywh: XYWH }>;
  };

  width: number;

  constructor(gfx: GfxController, background: Color) {
    super(gfx, background);
    this.slots = {
      draggingNoteUpdated: new Subject<{
        xywh: XYWH;
      }>(),
    };
    this.width = 0;
    this.height = 0;
    this.disposables.add(
      this.slots.draggingNoteUpdated.subscribe(({ xywh }) => {
        [this.x, this.y, this.width, this.height] = xywh;
        const surface = getSurfaceComponent(this.gfx.std);
        surface?.refresh();
      })
    );
  }

  override render(ctx: CanvasRenderingContext2D): void {
    // draw a rounded rectangle with provided background color and xywh
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = this.backgroundColor;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.10)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(this.x, this.y, this.width, this.height, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}
