import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import type { AffineInlineEditor } from '@blocksuite/affine-shared/types';
import type { EditorHost } from '@blocksuite/std';
import { z } from 'zod';

import { type LinkedMenuGroup, LinkedWidgetConfigExtension } from './config';
import { effects } from './effects';
import { linkedDocWidget } from './widget';

const optionsSchema = z.object({
  triggerKeys: z.optional(z.tuple([z.string()]).rest(z.string())),
  convertTriggerKey: z.boolean().optional(),
  ignoreBlockTypes: z.array(z.string()).optional(),
  ignoreSelector: z.string().optional(),
  getMenus: z.optional(
    z
      .function()
      .args(
        z.string(),
        z.function().returns(z.void()),
        z.custom<EditorHost>(),
        z.custom<AffineInlineEditor>(),
        z.instanceof(AbortSignal)
      )
      .returns(
        z.union([
          z.promise(z.array(z.custom<LinkedMenuGroup>())),
          z.array(z.custom<LinkedMenuGroup>()),
        ])
      )
  ),

  autoFocusedItemKey: z.optional(
    z
      .function()
      .args(
        z.array(z.custom<LinkedMenuGroup>()),
        z.string(),
        z.string().nullable(),
        z.custom<EditorHost>(),
        z.custom<AffineInlineEditor>()
      )
      .returns(z.string().nullable())
  ),

  mobile: z
    .object({
      scrollContainer: z.optional(
        z.union([z.string(), z.instanceof(HTMLElement), z.custom<Window>()])
      ),
      scrollTopOffset: z.optional(
        z.union([z.number(), z.function().returns(z.number())])
      ),
    })
    .optional(),
});

export type LinkedDocViewExtensionOptions = z.infer<typeof optionsSchema>;

export class LinkedDocViewExtension extends ViewExtensionProvider<LinkedDocViewExtensionOptions> {
  override name = 'affine-linked-doc-widget';

  override schema = optionsSchema;

  override effect() {
    super.effect();
    effects();
  }

  override setup(
    context: ViewExtensionContext,
    options?: LinkedDocViewExtensionOptions
  ) {
    super.setup(context);
    context.register(linkedDocWidget);
    if (options) {
      context.register(LinkedWidgetConfigExtension(options));
    }
  }
}
