import type { ExtensionType } from '@blocksuite/store';
import { z, type ZodSchema } from 'zod';

/**
 * An empty object type used as a default for extension provider options
 * when no specific options are needed.
 */
export type Empty = {};

/**
 * Context object provided to extension providers during setup.
 * Contains the scope information and a registration function for extensions.
 *
 * @typeParam Scope - The type of scope identifiers used for categorizing extensions
 */
export type Context<Scope extends string> = {
  /** The scope this context is associated with */
  scope: Scope;
  /** Function to register one or more extensions */
  register(extensions: ExtensionType[] | ExtensionType): Context<Scope>;
};

/**
 * Base class for all extension providers.
 * Provides common functionality for managing extensions and validating options.
 *
 * @typeParam Scope - The type of scope identifiers used for categorizing extensions
 * @typeParam Options - The type of configuration options for the provider
 *
 * @example
 * ```ts
 * class MyProvider extends BaseExtensionProvider<'my-scope', { enabled: boolean }> {
 *   name = 'MyProvider';
 *
 *   schema = z.object({
 *     enabled: z.boolean()
 *   });
 *
 *   setup(context: Context<'my-scope'>, options?: { enabled: boolean }) {
 *     super.setup(context, options);
 *     // Custom setup logic
 *   }
 * }
 * ```
 */
export class BaseExtensionProvider<
  Scope extends string,
  Options extends object = Empty,
> {
  /** The name of the provider */
  name = 'BaseExtension';

  /** Zod schema for validating provider options */
  schema: ZodSchema = z.object({});

  /**
   * Sets up the provider with the given context and options.
   * Validates the options against the schema if provided.
   *
   * @param context - The context object containing scope and registration function
   * @param option - Optional configuration options for the provider
   */
  setup(context: Context<Scope>, option?: Options) {
    if (option) {
      this.schema.parse(option);
    }
    context;
  }
}
