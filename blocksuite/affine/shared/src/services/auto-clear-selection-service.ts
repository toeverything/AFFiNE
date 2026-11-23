import { LifeCycleWatcher } from '@blocksuite/std';

// Auto Clear selection when switching doc mode.
export class AutoClearSelectionService extends LifeCycleWatcher {
  static override readonly key = 'auto-clear-selection-service';

  override unmounted() {
    if (this.std.store.readonly) return;

    this.std.selection.clear();
  }
}
