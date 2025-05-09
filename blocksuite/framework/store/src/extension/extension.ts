import type { Container } from '@blocksuite/global/di';

/**
 * # Understanding Extensions
 *
 * Extensions provide a way to extend the functionality of a system using dependency injection.
 * They allow you to register services, implementations, and factories in the DI container,
 * which can then be retrieved and used by different parts of the application.
 *
 * Extensions are particularly useful for:
 * - Registering different implementations for different types
 * - Creating pluggable architecture where components can be added or removed
 * - Managing dependencies between different parts of the application
 *
 * # Usage Example: Fruit Processing System
 *
 * Let's consider a fruit processing system where different types of fruits need
 * different processing methods. We'll show how to implement this using extensions.
 *
 * ## Step 1: Define the interfaces
 *
 * ```ts
 * interface FruitProcessor {
 *   process(fruit: Fruit): void;
 * }
 *
 * interface Fruit {
 *   type: string;
 *   // other properties
 * }
 * ```
 *
 * ## Step 2: Create a service identifier
 *
 * ```ts
 * import { createIdentifier } from '@blocksuite/global/di';
 *
 * const FruitProcessorProvider = createIdentifier<FruitProcessor>('fruit-processor-provider');
 * ```
 *
 * ## Step 3: Create implementations
 *
 * ```ts
 * class AppleProcessor implements FruitProcessor {
 *   process(fruit: Fruit): void {
 *     console.log('Slicing apple');
 *     // Apple-specific processing
 *   }
 * }
 *
 * class BananaProcessor implements FruitProcessor {
 *   process(fruit: Fruit): void {
 *     console.log('Peeling banana');
 *     // Banana-specific processing
 *   }
 * }
 * ```
 *
 * ## Step 4: Create an extension factory
 *
 * ```ts
 * const FruitProcessorExtension = (
 *   fruitType: string,
 *   implementation: new () => FruitProcessor
 * ): ExtensionType => {
 *   return {
 *     setup: di => {
 *       di.addImpl(FruitProcessorProvider(fruitType), implementation);
 *     }
 *   };
 * };
 * ```
 *
 * ## Step 5: Create concrete extensions
 *
 * ```ts
 * export const AppleProcessorExtension = FruitProcessorExtension('apple', AppleProcessor);
 * export const BananaProcessorExtension = FruitProcessorExtension('banana', BananaProcessor);
 * ```
 *
 * ## Step 6: Use the extensions
 *
 * ```ts
 * import { Container } from '@blocksuite/global/di';
 *
 * class FruitProcessingSystem {
 *   provider: ServiceProvider;
 *
 *   constructor(extensions: ExtensionType[]) {
 *     const container = new Container();
 *
 *     // Set up all extensions
 *     extensions.forEach(ext => ext.setup(container));
 *
 *     // Create a provider from the container
 *     this.provider = container.provider();
 *   }
 *
 *   processFruit(fruit: Fruit) {
 *     // Get the appropriate processor based on fruit type
 *     const processor = this.provider.get(FruitProcessorProvider(fruit.type));
 *
 *     // Process the fruit
 *     processor.process(fruit);
 *   }
 * }
 *
 * // Initialize the system with extensions
 * const system = new FruitProcessingSystem([
 *   AppleProcessorExtension,
 *   BananaProcessorExtension
 * ]);
 *
 * // Use the system
 * system.processFruit({ type: 'apple' });  // Output: Slicing apple
 * system.processFruit({ type: 'banana' }); // Output: Peeling banana
 * ```
 *
 * Note: We deliberately used a non-block specific example here. In BlockSuite, the extension
 * pattern can be applied to any entity that can be configured by third parties, not just blocks.
 * This includes different tools in the whiteboard, different column types in database blocks,
 * and many other extensible components. The pattern remains the same regardless of what you're extending.
 *
 * @category Extension
 */
export abstract class Extension {
  static setup(_di: Container): void {
    // do nothing
  }
}

export interface ExtensionType {
  setup(di: Container): void;
}
