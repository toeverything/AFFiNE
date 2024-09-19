import '../../_common/components/ask-ai-button';

import {
  type AffineFormatBarWidget,
  toolbarDefaultConfig,
} from '@blocksuite/affine/blocks';
import { html, type TemplateResult } from 'lit';

import { AIItemGroups } from '../../_common/config';

export function setupFormatBarAIEntry(formatBar: AffineFormatBarWidget) {
  toolbarDefaultConfig(formatBar);
  formatBar.addRawConfigItems(
    [
      {
        type: 'custom' as const,
        render(formatBar: AffineFormatBarWidget): TemplateResult | null {
          return html` <ask-ai-button
            .host=${formatBar.host}
            .actionGroups=${AIItemGroups}
            .toggleType=${'hover'}
          ></ask-ai-button>`;
        },
      },
      { type: 'divider' },
    ],
    0
  );
}
