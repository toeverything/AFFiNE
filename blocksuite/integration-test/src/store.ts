import { StoreExtensionManager } from '@blocksuite/affine/ext-loader';
import { getInternalStoreExtensions } from '@blocksuite/affine/extensions/store';

const manager = new StoreExtensionManager(getInternalStoreExtensions());

export function getTestStoreManager() {
  return manager;
}
