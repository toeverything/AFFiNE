import { DisposableGroup } from '@blocksuite/global/disposable';
import { noop } from '@blocksuite/global/utils';
import type { GfxController } from '@blocksuite/std/gfx';
import { startWith } from 'rxjs';

import type { RoughCanvas } from '../utils/rough/canvas';
import { Overlay } from './overlay';

export class ToolOverlay extends Overlay {
  protected disposables = new DisposableGroup();

  globalAlpha: number;

  x: number;

  y: number;

  constructor(gfx: GfxController) {
    super(gfx);
    this.x = 0;
    this.y = 0;
    this.globalAlpha = 1;
    this.gfx = gfx;

    this.disposables.add(
      this.gfx.viewport.viewportUpdated.pipe(startWith(null)).subscribe(() => {
        // when viewport is updated, we should keep the overlay in the same position
        // to get last mouse position and convert it to model coordinates
        const pos = this.gfx.tool.lastMouseViewPos$.value;
        const [x, y] = this.gfx.viewport.toModelCoord(pos.x, pos.y);
        this.x = x;
        this.y = y;
      })
    );
  }

  override dispose(): void {
    this.disposables.dispose();
  }

  render(ctx: CanvasRenderingContext2D, rc: RoughCanvas): void {
    noop([ctx, rc]);
  }
}
