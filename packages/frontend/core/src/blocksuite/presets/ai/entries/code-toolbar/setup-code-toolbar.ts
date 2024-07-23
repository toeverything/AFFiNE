import '../../_common/components/ask-ai-button';

import type {
  AffineCodeToolbarWidget,
  CodeBlockComponent,
} from '@blocksuite/blocks';
import { html } from 'lit';

const AICodeItemGroups = buildAICodeItemGroups();
const buttonOptions: AskAIButtonOptions = {
  size: 'small',
  panelWidth: 240,
};

import type { AskAIButtonOptions } from '../../_common/components/ask-ai-button';
import { buildAICodeItemGroups } from '../../_common/config';
import { AIStarIcon } from '../../_common/icons';

export function setupCodeToolbarEntry(codeToolbar: AffineCodeToolbarWidget) {
  const onAskAIClick = () => {
    const { host } = codeToolbar;
    const { selection } = host;
    const codeBlock = codeToolbar.block;
    selection.setGroup('note', [
      selection.create('block', { blockId: codeBlock.blockId }),
    ]);
  };
  codeToolbar.setupDefaultConfig();
  codeToolbar.addItems(
    [
      {
        type: 'custom',
        name: 'Ask AI',
        tooltip: 'Ask AI',
        icon: AIStarIcon,
        showWhen: CodeBlockComponent => !CodeBlockComponent.doc.readonly,
        render(codeBlock: CodeBlockComponent, onClick?: () => void) {
          return html`<ask-ai-button
            class="code-toolbar-button ask-ai"
            .host=${codeBlock.host}
            .actionGroups=${AICodeItemGroups}
            .toggleType=${'click'}
            .options=${buttonOptions}
            @click=${(e: MouseEvent) => {
              e.stopPropagation();
              onAskAIClick();
              onClick?.();
            }}
          ></ask-ai-button>`;
        },
      },
    ],
    0
  );
}
