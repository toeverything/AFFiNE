import type { ElementOrFactory } from '@affine/component';
import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import type { TemplateResult } from 'lit';
import { z } from 'zod';

import { patchForPDFEmbedView } from './pdf-view';

const optionsSchema = z.object({
  enablePDFEmbedPreview: z.boolean().optional(),
  reactToLit: z.optional(
    z
      .function()
      .args(z.custom<ElementOrFactory>(), z.boolean().optional())
      .returns(z.custom<TemplateResult>())
  ),
});

type PdfViewOptions = z.infer<typeof optionsSchema>;

export class PdfViewExtension extends ViewExtensionProvider<PdfViewOptions> {
  override name = 'affine-view-pdf';

  override schema = optionsSchema;

  override setup(context: ViewExtensionContext, options?: PdfViewOptions) {
    super.setup(context, options);
    const enablePDFEmbedPreview = options?.enablePDFEmbedPreview;
    const reactToLit = options?.reactToLit;
    if (!enablePDFEmbedPreview || !reactToLit) {
      return;
    }

    context.register(patchForPDFEmbedView(reactToLit));
  }
}
