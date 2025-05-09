import { StoreExtensionManager } from '@blocksuite/affine-ext-loader';

import { getInternalStoreExtensions } from '../../extensions/store';

const manager = new StoreExtensionManager(getInternalStoreExtensions());

export const testStoreExtensions = manager.get('store');
