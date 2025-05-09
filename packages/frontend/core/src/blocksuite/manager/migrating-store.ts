import {
  type StoreExtensionContext,
  StoreExtensionManager,
  StoreExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import { getInternalStoreExtensions } from '@blocksuite/affine/extensions/store';

import { AIChatBlockSchemaExtension } from '../ai/blocks/ai-chat-block/model';
import { TranscriptionBlockSchemaExtension } from '../ai/blocks/transcription-block/model';

class MigratingAffineStoreExtension extends StoreExtensionProvider {
  override name = 'affine-store-extensions';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(AIChatBlockSchemaExtension);
    context.register(TranscriptionBlockSchemaExtension);
  }
}

const manager = new StoreExtensionManager([
  ...getInternalStoreExtensions(),
  MigratingAffineStoreExtension,
]);

export function getStoreManager() {
  return manager;
}
