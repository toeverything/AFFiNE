import '../../_common/components/ask-ai-button';

import type { AffineCodeToolbarWidget } from '@blocksuite/affine/blocks';
import { html } from 'lit';

const AICodeItemGroups = buildAICodeItemGroups();
const buttonOptions: AskAIButtonOptions = {
  size: 'small',
  panelWidth: 240,
};

import type { AskAIButtonOptions } from '../../_common/components/ask-ai-button';
import { buildAICodeItemGroups } from '../../_common/config';

export function setupCodeToolbarAIEntry(codeToolbar: AffineCodeToolbarWidget) {
  codeToolbar.addPrimaryItems([
    {
      type: 'ask-ai',
      when: ({ doc }) => !doc.readonly,
      generate: ({ host, blockComponent }) => {
        return {
          action: () => {
            const { selection } = host;
            selection.setGroup('note', [
              selection.create('block', { blockId: blockComponent.blockId }),
            ]);
          },
          render: item =>
            html`<ask-ai-button
              class="code-toolbar-button ask-ai"
              .host=${host}
              .actionGroups=${AICodeItemGroups}
              .toggleType=${'click'}
              .options=${buttonOptions}
              @click=${(e: MouseEvent) => {
                e.stopPropagation();
                item.action();
              }}
            ></ask-ai-button>`,
        };
      },
    },
  ]);
}
