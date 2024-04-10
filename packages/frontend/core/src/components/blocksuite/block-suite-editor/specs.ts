import type { ElementOrFactory } from '@affine/component';
import type { BlockSpec } from '@blocksuite/block-std';
import type { ParagraphService, RootService } from '@blocksuite/blocks';
import {
  AttachmentService,
  CanvasTextFonts,
  EdgelessRootService,
  PageRootService,
} from '@blocksuite/blocks';
import bytes from 'bytes';
import type { TemplateResult } from 'lit';

import { getParsedAISpecs } from './ai/spec';

const {
  pageModeSpecs: PageEditorBlockSpecs,
  edgelessModeSpecs: EdgelessEditorBlockSpecs,
} = getParsedAISpecs();

class CustomAttachmentService extends AttachmentService {
  override mounted(): void {
    // blocksuite default max file size is 10MB, we override it to 2GB
    // but the real place to limit blob size is CloudQuotaModal / LocalQuotaModal
    this.maxFileSize = bytes.parse('2GB');
  }
}

function customLoadFonts(service: RootService): void {
  if (runtimeConfig.isSelfHosted) {
    const fonts = CanvasTextFonts.map(font => ({
      ...font,
      // self-hosted fonts are served from /assets
      url: '/assets/' + new URL(font.url).pathname.split('/').pop(),
    }));
    service.fontLoader.load(fonts);
  } else {
    service.fontLoader.load(CanvasTextFonts);
  }
}

class CustomDocPageService extends PageRootService {
  override loadFonts(): void {
    customLoadFonts(this);
  }
}
class CustomEdgelessPageService extends EdgelessRootService {
  override loadFonts(): void {
    customLoadFonts(this);
  }
}

type AffineReference = HTMLElementTagNameMap['affine-reference'];
type PageReferenceRenderer = (reference: AffineReference) => React.ReactElement;

export interface InlineRenderers {
  pageReference?: PageReferenceRenderer;
}

function patchSpecsWithReferenceRenderer(
  specs: BlockSpec<string>[],
  pageReferenceRenderer: PageReferenceRenderer,
  toLitTemplate: (element: ElementOrFactory) => TemplateResult
) {
  const renderer = (reference: AffineReference) => {
    const node = pageReferenceRenderer(reference);
    return toLitTemplate(node);
  };
  return specs.map(spec => {
    if (
      ['affine:paragraph', 'affine:list', 'affine:database'].includes(
        spec.schema.model.flavour
      )
    ) {
      // todo: remove these type assertions
      spec.service = class extends (spec.service as typeof ParagraphService) {
        override mounted() {
          super.mounted();
          this.referenceNodeConfig.setCustomContent(renderer);
        }
      };
    }

    return spec;
  });
}

/**
 * Patch the block specs with custom renderers.
 */
export function patchSpecs(
  specs: BlockSpec<string>[],
  toLitTemplate: (element: ElementOrFactory) => TemplateResult,
  inlineRenderers?: InlineRenderers
) {
  let newSpecs = specs;
  if (inlineRenderers?.pageReference) {
    newSpecs = patchSpecsWithReferenceRenderer(
      newSpecs,
      inlineRenderers.pageReference,
      toLitTemplate
    );
  }
  return newSpecs;
}

export const docModeSpecs = PageEditorBlockSpecs.map(spec => {
  if (spec.schema.model.flavour === 'affine:attachment') {
    return {
      ...spec,
      service: CustomAttachmentService,
    };
  }
  if (spec.schema.model.flavour === 'affine:page') {
    return {
      ...spec,
      service: CustomDocPageService,
    };
  }
  return spec;
});
export const edgelessModeSpecs = EdgelessEditorBlockSpecs.map(spec => {
  if (spec.schema.model.flavour === 'affine:attachment') {
    return {
      ...spec,
      service: CustomAttachmentService,
    };
  }
  if (spec.schema.model.flavour === 'affine:page') {
    return {
      ...spec,
      service: CustomEdgelessPageService,
    };
  }
  return spec;
});
