import { AffineCodeToolbarWidget } from '@blocksuite/affine/blocks/code';
import { LifeCycleWatcher } from '@blocksuite/affine/std';

import { setupCodeToolbarAIEntry } from '../entries/code-toolbar/setup-code-toolbar';

export class AICodeBlockWatcher extends LifeCycleWatcher {
  static override key = 'ai-code-block-watcher';

  override mounted() {
    super.mounted();
    const { view } = this.std;
    view.viewUpdated.subscribe(payload => {
      if (payload.type !== 'widget' || payload.method !== 'add') {
        return;
      }
      const component = payload.view;
      if (component instanceof AffineCodeToolbarWidget) {
        setupCodeToolbarAIEntry(component);
      }
    });
  }
}
