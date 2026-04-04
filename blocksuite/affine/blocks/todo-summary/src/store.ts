import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import { TodoSummaryBlockSchemaExtension } from '@blocksuite/affine-model';

export class TodoSummaryStoreExtension extends StoreExtensionProvider {
  override name = 'affine-todo-summary-block';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(TodoSummaryBlockSchemaExtension);
  }
}
