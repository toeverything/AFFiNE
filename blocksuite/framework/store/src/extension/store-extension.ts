import { type Container, createIdentifier } from '@blocksuite/global/di';
import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';

import type { Store } from '../model/store';
import { StoreIdentifier } from '../model/store/identifier';
import { Extension } from './extension';

export const StoreExtensionIdentifier =
  createIdentifier<StoreExtension>('StoreExtension');

export const storeExtensionSymbol = Symbol('StoreExtension');

/**
 * Store extensions are used to extend the store.
 * They should be registered to the store. And they should be able to run in a none-dom environment.
 *
 * @category Extension
 */
export class StoreExtension extends Extension {
  /**
   * The key of the store extension.
   * **You must override this property with a unique string.**
   */
  static readonly key: string;

  constructor(readonly store: Store) {
    super();
  }

  /**
   * Lifecycle hook when the yjs document is loaded.
   */
  loaded() {}

  /**
   * Lifecycle hook when the yjs document is disposed.
   */
  disposed() {}

  static readonly [storeExtensionSymbol] = true;

  static override setup(di: Container) {
    if (!this.key) {
      throw new BlockSuiteError(
        ErrorCode.ValueNotExists,
        'Key is not defined in the StoreExtension'
      );
    }

    di.add(this, [StoreIdentifier]);
    di.addImpl(StoreExtensionIdentifier(this.key), provider =>
      provider.get(this)
    );
  }
}

export function isStoreExtensionConstructor(
  extension: object
): extension is typeof StoreExtension {
  return storeExtensionSymbol in extension;
}
