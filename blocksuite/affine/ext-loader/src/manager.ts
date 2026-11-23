import { BlockSuiteError } from '@blocksuite/global/exceptions';
import type { ExtensionType } from '@blocksuite/store';

import type { BaseExtensionProvider, Context, Empty } from './base-provider';

/**
 * A manager class that handles the registration and configuration of extensions
 * for different scopes. It manages extension providers and their instances,
 * allowing for dynamic configuration and extension loading.
 *
 * @typeParam Scope - The type of scope identifiers used for categorizing extensions
 */
export class ExtensionManager<Scope extends string> {
  /** @internal */
  protected _extensions: Map<string, Set<ExtensionType>> = new Map();
  /** @internal */
  private readonly _providers: Set<typeof BaseExtensionProvider<Scope>>;
  /** @internal */
  private readonly _providerOptions: Map<
    typeof BaseExtensionProvider<Scope>,
    object
  > = new Map();
  /** @internal */
  private readonly _providerInstances: Map<
    typeof BaseExtensionProvider<Scope>,
    BaseExtensionProvider<Scope>
  > = new Map();

  /**
   * Creates a new ExtensionManager instance with the specified providers.
   *
   * @param providers - Array of extension provider classes to be managed
   */
  constructor(providers: Array<typeof BaseExtensionProvider<Scope>>) {
    this._providers = new Set(providers);
  }

  /** @internal */
  private readonly _build = (scope: Scope) => {
    const context = this._getContextByScope(scope);

    this._providers.forEach(Provider => {
      let instance: BaseExtensionProvider<Scope>;
      if (this._providerInstances.has(Provider)) {
        instance = this._providerInstances.get(Provider)!;
      } else {
        instance = new Provider();
        this._providerInstances.set(Provider, instance);
      }
      instance.setup(context, this._providerOptions.get(Provider));
    });
  };

  /** @internal */
  private readonly _registerToScope = (
    scope: Scope,
    extensions: ExtensionType[] | ExtensionType
  ) => {
    let extSet: Set<ExtensionType>;
    if (!this._extensions.has(scope)) {
      extSet = new Set();
    } else {
      extSet = this._extensions.get(scope)!;
    }

    const extensionsArray = Array.isArray(extensions)
      ? extensions
      : [extensions];
    extensionsArray.forEach(extension => {
      extSet.add(extension);
    });

    this._extensions.set(scope, extSet);
  };

  /** @internal */
  private readonly _getContextByScope = (scope: Scope): Context<Scope> => {
    const context: Context<Scope> = {
      scope,
      register: (extensions: ExtensionType[] | ExtensionType) => {
        this._registerToScope(scope, extensions);
        return context;
      },
    };
    return context;
  };

  /**
   * Retrieves all extensions registered for a specific scope.
   * It triggers the build process.
   *
   * @param scope - The scope to retrieve extensions for
   * @returns An array of extensions registered for the specified scope
   * @throws {BlockSuiteError} If the scope is not found
   */
  get(scope: Scope) {
    if (this._extensions.has(scope)) {
      this._extensions.delete(scope);
    }
    this._build(scope);
    const extensionSet = this._extensions.get(scope);
    if (!extensionSet) {
      throw new BlockSuiteError(
        BlockSuiteError.ErrorCode.ValueNotExists,
        `Extension scope ${scope} not found`
      );
    }
    return Array.from(extensionSet);
  }

  /**
   * Configures a specific provider with new options.
   * Can update existing configuration or remove it entirely.
   * Triggers a rebuild of the provider instance when configuration changes.
   *
   * @typeParam T - The type of configuration options for the provider
   * @param provider - The provider class to configure
   * @param options - New configuration options or a function to update existing options
   */
  configure<T extends Empty>(
    provider: typeof BaseExtensionProvider<Scope, T>,
    options: ((prev: T | undefined) => T | undefined) | T | undefined
  ) {
    const prev = this._providerOptions.get(provider);

    let config: T | undefined;
    if (typeof options === 'function') {
      config = (options as (prev: unknown) => T)(prev);
    } else {
      config = options;
    }

    if (prev === config) {
      return;
    }

    if (config === undefined) {
      this._providerOptions.delete(provider);
    } else {
      this._providerOptions.set(provider, config);
    }

    // If the config is changed, we need to rebuild the extension
    this._providerInstances.delete(provider);
  }
}
