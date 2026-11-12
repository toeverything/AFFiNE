import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import { NoteRefBlockSchemaExtension } from '@blocksuite/affine-model';

export class NoteRefStoreExtension extends StoreExtensionProvider {
  override name = 'affine-note-ref-block';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(NoteRefBlockSchemaExtension);
  }
}
