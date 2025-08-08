import { noop } from '@blocksuite/affine/global/utils';
import type { DocMode } from '@blocksuite/affine/model';
import {
  ActionPlacement,
  type ToolbarModuleConfig,
} from '@blocksuite/affine/shared/services';
import { html } from 'lit';

import type { AIItemGroupConfig } from '../../components/ai-item/types';
import { AIProvider } from '../../provider';
import { getAIPanelWidget } from '../../utils/ai-widgets';
import { getEdgelessCopilotWidget } from '../../utils/edgeless';
import { extractSelectedContent } from '../../utils/extract';
import type { EdgelessCopilotWidget } from '../../widgets/edgeless-copilot';
import { EdgelessCopilotToolbarEntry } from '../../widgets/edgeless-copilot-panel/toolbar-entry';
import { edgelessAIGroups } from './actions-config';

noop(EdgelessCopilotToolbarEntry);

export function setupEdgelessCopilot(widget: EdgelessCopilotWidget) {
  widget.groups = edgelessAIGroups;
}

export function edgelessToolbarAIEntryConfig(): ToolbarModuleConfig {
  return {
    actions: [
      {
        placement: ActionPlacement.Start,
        id: 'A.ai',
        score: -1,
        when(ctx) {
          const models = ctx.getSurfaceModels();
          return models.length > 0 && !models.some(model => model.isLocked());
        },
        content: ({ host, chain }) => {
          const filteredGroups = edgelessAIGroups.reduce<AIItemGroupConfig[]>(
            (pre, group) => {
              const filtered = group.items.filter(item =>
                item.showWhen?.(chain, 'edgeless' as DocMode, host)
              );

              if (filtered.length > 0) pre.push({ ...group, items: filtered });

              return pre;
            },
            []
          );

          if (filteredGroups.every(group => group.items.length === 0))
            return null;

          const handler = () => {
            const aiPanel = getAIPanelWidget(host);
            if (aiPanel.config) {
              aiPanel.config.generateAnswer = ({ finish, input }) => {
                finish('success');
                aiPanel.hide();
                extractSelectedContent(host)
                  .then(context => {
                    if (context?.attachments?.length || context?.docs?.length) {
                      AIProvider.slots.requestOpenWithChat.next({
                        input,
                        host,
                        context,
                        autoSelect: true,
                      });
                    } else {
                      AIProvider.slots.requestSendWithChat.next({
                        input,
                        context,
                        host,
                      });
                    }
                  })
                  .catch(console.error);
              };
              aiPanel.config.inputCallback = text => {
                const copilotWidget = getEdgelessCopilotWidget(host);
                const panel = copilotWidget.shadowRoot?.querySelector(
                  'edgeless-copilot-panel'
                );
                if (panel instanceof HTMLElement) {
                  panel.style.visibility = text ? 'hidden' : 'visible';
                }
              };
            }
          };

          return html`<edgeless-copilot-toolbar-entry
            .host=${host}
            .groups=${edgelessAIGroups}
            .onClick=${handler}
          ></edgeless-copilot-toolbar-entry>`;
        },
      },
    ],
  };
}
