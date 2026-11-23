import { type Container, createIdentifier } from '@blocksuite/global/di';
import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import {
  type GfxController,
  GfxControllerIdentifier,
} from '@blocksuite/std/gfx';
import { Extension } from '@blocksuite/store';

import type { RoughCanvas } from '../utils/rough/canvas.js';
import type { CanvasRenderer } from './canvas-renderer.js';

/**
 * An overlay is a layer covered on top of elements,
 * can be used for rendering non-CRDT state indicators.
 */
export abstract class Overlay extends Extension {
  static overlayName: string = '';

  protected _renderer: CanvasRenderer | null = null;

  constructor(protected gfx: GfxController) {
    super();
  }

  static override setup(di: Container): void {
    if (!this.overlayName) {
      throw new BlockSuiteError(
        ErrorCode.ValueNotExists,
        `The overlay constructor '${this.name}' should have a static 'overlayName' property.`
      );
    }

    di.addImpl(OverlayIdentifier(this.overlayName), this, [
      GfxControllerIdentifier,
    ]);
  }

  clear() {
    this.refresh();
  }

  dispose() {}

  refresh() {
    if (this._renderer) {
      this._renderer.refresh();
    }
  }

  abstract render(ctx: CanvasRenderingContext2D, rc: RoughCanvas): void;

  setRenderer(renderer: CanvasRenderer | null) {
    this._renderer = renderer;
  }
}

export const OverlayIdentifier = createIdentifier<Overlay>('Overlay');
