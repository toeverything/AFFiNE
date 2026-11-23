import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import {
  groupToMarkdownAdapterMatcher,
  groupToPlainTextAdapterMatcher,
} from './adapter';
import { groupRelationWatcherExtension } from './group-watcher';

export class GroupStoreExtension extends StoreExtensionProvider {
  override name = 'affine-group-gfx';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(groupToPlainTextAdapterMatcher);
    context.register(groupToMarkdownAdapterMatcher);
    context.register(groupRelationWatcherExtension);
  }
}
