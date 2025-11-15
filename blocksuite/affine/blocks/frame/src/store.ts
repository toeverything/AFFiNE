import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import { FrameBlockSchemaExtension } from '@blocksuite/affine-model';

export class FrameStoreExtension extends StoreExtensionProvider {
  override name = 'affine-frame-block';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register([FrameBlockSchemaExtension]);
  }
}
