import { AIChatBlockSpec } from '@affine/core/blocksuite/presets/blocks/ai-chat-block';
import type { ExtensionType } from '@blocksuite/affine/block-std';
import { SpecProvider } from '@blocksuite/affine/blocks';

import { getFontConfigExtension } from './font-extension';

const CustomSpecs: ExtensionType[] = [
  AIChatBlockSpec,
  getFontConfigExtension(),
].flat();

function patchPreviewSpec(id: string, specs: ExtensionType[]) {
  const specProvider = SpecProvider.getInstance();
  specProvider.extendSpec(id, specs);
}

export function effects() {
  // Patch edgeless preview spec for blocksuite surface-ref and embed-synced-doc
  patchPreviewSpec('edgeless:preview', CustomSpecs);
}
