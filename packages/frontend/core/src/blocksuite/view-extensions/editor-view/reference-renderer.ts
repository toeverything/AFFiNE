import type { ReactToLit } from '@affine/component';
import type { AffineReference } from '@blocksuite/affine/inlines/reference';
import { ReferenceNodeConfigExtension } from '@blocksuite/affine/inlines/reference';
import type { ExtensionType } from '@blocksuite/affine/store';

export type ReferenceReactRenderer = (
  reference: AffineReference
) => React.ReactElement;

export function patchReferenceRenderer(
  reactToLit: ReactToLit,
  reactRenderer: ReferenceReactRenderer
): ExtensionType {
  const customContent = (reference: AffineReference) => {
    const node = reactRenderer(reference);
    return reactToLit(node, true);
  };

  return ReferenceNodeConfigExtension({
    customContent,
    hidePopup: BUILD_CONFIG.isMobileEdition,
  });
}
