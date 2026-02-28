import { LifeCycleWatcher } from '@blocksuite/affine/std';
import type { FrameworkProvider } from '@toeverything/infra';

import { buildAIPanelConfig } from '../ai-panel';
import { setupEdgelessCopilot } from '../entries/edgeless/index';
import { setupSpaceAIEntry } from '../entries/space/setup-space';
import { AffineAIPanelWidget } from '../widgets/ai-panel/ai-panel';
import { EdgelessCopilotWidget } from '../widgets/edgeless-copilot';

export function getAIEdgelessRootWatcher(framework: FrameworkProvider) {
  class AIEdgelessRootWatcher extends LifeCycleWatcher {
    static override key = 'ai-edgeless-root-watcher';

    override mounted() {
      super.mounted();
      const { view } = this.std;
      view.viewUpdated.subscribe(payload => {
        if (payload.type !== 'widget' || payload.method !== 'add') {
          return;
        }
        const component = payload.view;
        if (component instanceof AffineAIPanelWidget) {
          component.style.width = '430px';
          component.config = buildAIPanelConfig(component, framework);
          setupSpaceAIEntry(component);
        }

        if (component instanceof EdgelessCopilotWidget) {
          setupEdgelessCopilot(component);
        }
      });
    }
  }
  return AIEdgelessRootWatcher;
}
