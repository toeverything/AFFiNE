import { BlockViewExtension } from '@blocksuite/affine/std';
import type { ExtensionType } from '@blocksuite/affine/store';
import { literal } from 'lit/static-html.js';

export const AIChatBlockSpec: ExtensionType[] = [
  BlockViewExtension('affine:embed-ai-chat', model => {
    const parent = model.store.getParent(model.id);

    if (parent?.flavour === 'affine:surface') {
      return literal`affine-edgeless-ai-chat`;
    }

    return literal`affine-ai-chat`;
  }),
];
