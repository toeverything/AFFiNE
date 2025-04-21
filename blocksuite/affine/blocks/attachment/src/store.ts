import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import { AttachmentBlockSchemaExtension } from '@blocksuite/affine-model';

import { AttachmentBlockNotionHtmlAdapterExtension } from './adapters/notion-html';

export default class AttachmentStoreExtension extends StoreExtensionProvider {
  override name = 'affine-attachment-block';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(AttachmentBlockSchemaExtension);
    context.register(AttachmentBlockNotionHtmlAdapterExtension);
  }
}
