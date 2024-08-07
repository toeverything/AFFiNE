import type { BlockSpec } from '@blocksuite/block-std';
import { SpecProvider } from '@blocksuite/blocks';
import { AIChatBlockSpec, EdgelessAIChatBlockSpec } from '@blocksuite/presets';

const CustomSpecs: BlockSpec[] = [AIChatBlockSpec, EdgelessAIChatBlockSpec];

function patchPreviewSpec(id: string, specs: BlockSpec[]) {
  const specProvider = SpecProvider.getInstance();
  specProvider.extendSpec(id, specs);
}

// Patch edgeless preview spec for blocksuite surface-ref and embed-synced-doc
patchPreviewSpec('edgeless:preview', CustomSpecs);
