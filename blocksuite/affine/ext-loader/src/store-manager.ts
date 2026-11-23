import { createIdentifier } from '@blocksuite/global/di';
import type { ExtensionType } from '@blocksuite/store';

import { ExtensionManager } from './manager';

/**
 * Identifier for the StoreExtensionManager that can be used for dependency injection.
 */
export const StoreExtensionManagerIdentifier =
  createIdentifier<StoreExtensionManager>('StoreExtensionManager');

/**
 * A specialized extension manager for store-related extensions.
 * Extends the base ExtensionManager to provide store-specific functionality.
 *
 * This manager is responsible for handling store-related extensions and ensuring
 * proper dependency injection setup for store components.
 *
 * @example
 * ```ts
 * // Create a store extension manager with providers
 * const manager = new StoreExtensionManager([MyStoreProvider]);
 *
 * // Configure provider options
 * manager.configure(MyStoreProvider, { option1: 'value' });
 *
 * // Get store extensions
 * const extensions = manager.get('store');
 * ```
 */
export class StoreExtensionManager extends ExtensionManager<'store'> {
  /**
   * Retrieves store extensions and adds self-registration functionality.
   *
   * @param scope - The scope of extensions to retrieve, must be 'store'
   * @returns An array of extensions including the self-registration extension
   */
  override get(scope: 'store') {
    const extensions = super.get(scope);
    const selfExtension: ExtensionType = {
      setup: di => {
        di.addImpl(StoreExtensionManagerIdentifier, () => this);
      },
    };
    return extensions.concat(selfExtension);
  }
}
