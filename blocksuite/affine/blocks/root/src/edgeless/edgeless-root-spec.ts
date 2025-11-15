import { LifeCycleWatcher } from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';

export class EdgelessLocker extends LifeCycleWatcher {
  static override key = 'edgeless-locker';

  override mounted() {
    const { viewport } = this.std.get(GfxControllerIdentifier);
    viewport.locked = true;
  }
}
