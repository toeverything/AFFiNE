import { FootNoteNodeConfigExtension } from '@blocksuite/affine/inlines/footnote';
import type { SpecBuilder } from '@blocksuite/affine/shared/utils';

// Disable hover effect for footnote node
const disableHoverEffectConfig = {
  disableHoverEffect: true,
};

export function enableFootnoteConfigExtension(
  specBuilder: SpecBuilder,
  config = disableHoverEffectConfig
) {
  const footNoteConfig = FootNoteNodeConfigExtension(config);
  return specBuilder.extend([footNoteConfig]);
}
