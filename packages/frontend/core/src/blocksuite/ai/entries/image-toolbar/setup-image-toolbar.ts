import '../../components/ask-ai-button';

import { ImageBlockComponent } from '@blocksuite/affine/blocks/image';
import {
  ActionPlacement,
  type ToolbarModuleConfig,
} from '@blocksuite/affine/shared/services';
import { BlockSelection } from '@blocksuite/affine/std';
import { html } from 'lit';

import { buildAIImageItemGroups } from '../../_common/config';
import type { AskAIButtonOptions } from '../../components/ask-ai-button';

const AIImageItemGroups = buildAIImageItemGroups();
const buttonOptions: AskAIButtonOptions = {
  size: 'small',
  backgroundColor: 'var(--affine-white)',
  panelWidth: 300,
};

export function imageToolbarAIEntryConfig(): ToolbarModuleConfig {
  return {
    actions: [
      {
        placement: ActionPlacement.Start,
        id: 'A.ai',
        score: -1,
        content: ctx => {
          const block = ctx.getCurrentBlockByType(ImageBlockComponent);
          if (!block) return null;

          return html`<ask-ai-button
            class="ask-ai inner-button"
            .host=${ctx.host}
            .actionGroups=${AIImageItemGroups}
            .toggleType="${'click'}"
            .options=${buttonOptions}
            @click=${(e: MouseEvent) => {
              e.stopPropagation();
              ctx.selection.update(() => [
                ctx.selection.create(BlockSelection, {
                  blockId: block.blockId,
                }),
              ]);
            }}
          ></ask-ai-button>`;
        },
      },
    ],
  };
}
