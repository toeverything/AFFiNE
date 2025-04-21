import { createIdentifier } from '@blocksuite/global/di';
import type { ExtensionType } from '@blocksuite/store';

import { ExtensionManager } from './manager';
import type { ViewScope } from './view-provider';

/**
 * Identifier for the ViewExtensionManager that can be used for dependency injection.
 */
export const ViewExtensionManagerIdentifier =
  createIdentifier<ViewExtensionManager>('ViewExtensionManager');

/**
 * A specialized extension manager for view-related extensions.
 * Extends the base ExtensionManager to provide view-specific functionality.
 *
 * This manager is responsible for handling view-related extensions and ensuring
 * proper dependency injection setup for view components.
 *
 * @example
 * ```ts
 * // Create a view extension manager with providers
 * const manager = new ViewExtensionManager([MyViewProvider]);
 *
 * // Configure provider options
 * manager.configure(MyViewProvider, { option1: 'value' });
 *
 * // Get view extensions for a specific scope
 * const pageExtensions = manager.get('page');
 * const edgelessExtensions = manager.get('edgeless');
 * ```
 */
export class ViewExtensionManager extends ExtensionManager<ViewScope> {
  /**
   * Retrieves view extensions and adds self-registration functionality.
   *
   * @param scope - The scope of extensions to retrieve
   * @returns An array of extensions including the self-registration extension
   */
  override get(scope: ViewScope) {
    const extensions = super.get(scope);
    const selfExtension: ExtensionType = {
      setup: di => {
        di.addImpl(ViewExtensionManagerIdentifier, () => this);
      },
    };
    return extensions.concat(selfExtension);
  }
}
