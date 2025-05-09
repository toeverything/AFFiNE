import '../../components/ask-ai-button';

import {
  ActionPlacement,
  type ToolbarModuleConfig,
} from '@blocksuite/affine/shared/services';
import { html } from 'lit';

import { pageAIGroups } from '../../_common/config';

export function toolbarAIEntryConfig(): ToolbarModuleConfig {
  return {
    actions: [
      {
        placement: ActionPlacement.Start,
        id: 'A.ai',
        score: -1,
        when: ({ flags }) => !flags.isNative(),
        content: ({ host }) => html`
          <ask-ai-toolbar-button
            .host=${host}
            .actionGroups=${pageAIGroups}
          ></ask-ai-toolbar-button>
        `,
      },
    ],
  };
}
