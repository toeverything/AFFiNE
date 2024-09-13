import type { ExtensionType } from '@blocksuite/block-std';
import { SpecProvider } from '@blocksuite/blocks';
import { AIChatBlockSpec } from '@blocksuite/presets';

const CustomSpecs: ExtensionType[] = [AIChatBlockSpec].flat();

function patchPreviewSpec(id: string, specs: ExtensionType[]) {
  const specProvider = SpecProvider.getInstance();
  specProvider.extendSpec(id, specs);
}

export function effects() {
  // Patch edgeless preview spec for blocksuite surface-ref and embed-synced-doc
  patchPreviewSpec('edgeless:preview', CustomSpecs);
}
