import { AIChatBlockSchemaExtension } from '@affine/core/blocksuite/ai/blocks';
import { TranscriptionBlockSchemaExtension } from '@affine/core/blocksuite/ai/blocks/transcription-block/model';
import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine/ext-loader';

export class AIStoreExtension extends StoreExtensionProvider {
  override name = 'affine-store-extensions';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(AIChatBlockSchemaExtension);
    context.register(TranscriptionBlockSchemaExtension);
  }
}
