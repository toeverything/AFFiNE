import {
  BaseExtensionProvider,
  type Context,
  type Empty,
} from './base-provider';

/**
 * Available view scopes for view-related extensions.
 * Defines the different types of views where extensions can be applied.
 */
export type ViewScope =
  | 'page' // Standard page view
  | 'edgeless' // Edgeless (whiteboard) view
  | 'preview-page' // Page preview view
  | 'preview-edgeless' // Edgeless preview view
  | 'mobile-page' // Mobile page view
  | 'mobile-edgeless'; // Mobile edgeless view

/**
 * A specialized extension provider for view-related functionality.
 * Extends the base provider with view-specific scope and configuration.
 *
 * @typeParam Options - The type of configuration options for the view provider
 *
 * @example
 * ```ts
 * // Create a view provider with custom options
 * class MyViewProvider extends ViewExtensionProvider<{ theme: string }> {
 *   override name = 'MyViewProvider';
 *
 *   override schema = z.object({
 *     theme: z.enum(['light', 'dark'])
 *   });
 *
 *   override setup(context: ViewExtensionContext, options?: { theme: string }) {
 *     super.setup(context, options);
 *
 *     context.register([CommonExt]);
 *     if (context.scope === 'page') {
 *       context.register([PageExt]);
 *     } else if (context.scope === 'edgeless') {
 *       context.register([EdgelessExt]);
 *     }
 *     if (options?.theme === 'dark') {
 *       context.register([DarkModeExt]);
 *     }
 *   }
 *
 *   // Override effect to run one-time initialization logic
 *   override effect() {
 *     // This will only run once per provider class
 *     console.log('Initializing MyViewProvider');
 *   }
 * }
 * ```
 */
export class ViewExtensionProvider<
  Options extends object = Empty,
> extends BaseExtensionProvider<ViewScope, Options> {
  /** The name of the view extension provider */
  override name = 'ViewExtension';

  /**
   * Static flag to ensure effect is only run once per provider class
   * @internal
   */
  static effectRan = false;

  /**
   * Override this method to implement one-time initialization logic for the provider.
   * This method will be called automatically during setup, but only once per provider class.
   *
   * @example
   * ```ts
   * override effect() {
   *   super.effect();
   *   // Register lit elements
   *   registerLitElements();
   * }
   * ```
   */
  effect(): void {}

  /**
   * Check if the scope is edgeless
   * @param scope - The scope to check
   * @returns True if the scope is edgeless, false otherwise
   */
  isEdgeless = (scope: ViewScope) => {
    return (
      scope === 'edgeless' ||
      scope === 'preview-edgeless' ||
      scope === 'mobile-edgeless'
    );
  };

  /**
   * Check if the scope is preview
   * @param scope - The scope to check
   * @returns True if the scope is preview, false otherwise
   */
  isPreview = (scope: ViewScope) => {
    return scope === 'preview-page' || scope === 'preview-edgeless';
  };

  /**
   * Check if the scope is mobile
   * @param scope - The scope to check
   * @returns True if the scope is mobile, false otherwise
   */
  isMobile = (scope: ViewScope) => {
    return scope === 'mobile-page' || scope === 'mobile-edgeless';
  };

  override setup(context: ViewExtensionContext, options?: Options) {
    super.setup(context, options);
    const constructor = this.constructor as typeof ViewExtensionProvider;
    if (!constructor.effectRan) {
      constructor.effectRan = true;
      this.effect();
    }
  }
}

/**
 * Context type specifically for view-related extensions.
 * Provides type safety for view extension registration and setup.
 */
export type ViewExtensionContext = Context<ViewScope>;
