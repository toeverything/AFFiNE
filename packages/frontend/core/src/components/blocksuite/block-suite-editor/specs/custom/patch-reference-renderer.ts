import type { ElementOrFactory } from '@affine/component';
import type { BlockSpec } from '@blocksuite/block-std';
import type {
  AffineReference,
  ParagraphBlockService,
} from '@blocksuite/blocks';
import type { TemplateResult } from 'lit';

export type ReferenceReactRenderer = (
  reference: AffineReference
) => React.ReactElement;

/**
 * Patch the block specs with custom renderers.
 */
export function patchReferenceRenderer(
  specs: BlockSpec[],
  reactToLit: (element: ElementOrFactory) => TemplateResult,
  reactRenderer: ReferenceReactRenderer
) {
  const litRenderer = (reference: AffineReference) => {
    const node = reactRenderer(reference);
    return reactToLit(node);
  };

  return specs.map(spec => {
    if (
      ['affine:paragraph', 'affine:list', 'affine:database'].includes(
        spec.schema.model.flavour
      )
    ) {
      // todo: remove these type assertions
      spec.service = class extends (
        (spec.service as typeof ParagraphBlockService)
      ) {
        override mounted() {
          super.mounted();
          this.referenceNodeConfig.setCustomContent(litRenderer);
        }
      };
    }

    return spec;
  });
}
