import type { ServiceIdentifier, ServiceProvider } from '@blocksuite/global/di';

/**
 * Level of preprocessing
 * - doc: Process at to doc snapshot level
 * - slice: Process at to slice snapshot level
 * - block: Process at to block snapshot level
 */
export type PreprocessLevel = 'doc' | 'slice' | 'block';

/**
 * Interface for adapter preprocessor
 * @template T Type of content to process, defaults to string
 */
export type AdapterPreprocessor<T = string> = {
  /**
   * Unique name of the preprocessor
   */
  name: string;

  /**
   * Levels this preprocessor supports
   */
  levels: PreprocessLevel[];

  /**
   * Process the content
   * @param content Content to process
   * @returns Processed content
   */
  preprocess: (content: T) => T;
};

/**
 * Manager class for handling preprocessors
 * @template T Type of content to process
 * @template P Type of preprocessor
 */
export abstract class PreprocessorManager<T, P extends AdapterPreprocessor<T>> {
  protected readonly preprocessors: Map<PreprocessLevel, Set<P>>;

  constructor(
    protected readonly provider: ServiceProvider,
    protected readonly identifier: ServiceIdentifier<P>
  ) {
    this.preprocessors = new Map();

    // Initialize Sets for each level
    this.preprocessors.set('doc', new Set());
    this.preprocessors.set('slice', new Set());
    this.preprocessors.set('block', new Set());

    // Register all preprocessors from provider
    this.initializePreprocessors();
  }

  /**
   * Initialize preprocessors from provider
   */
  private initializePreprocessors(): void {
    const preprocessors = Array.from(
      this.provider.getAll(this.identifier).values()
    );

    for (const preprocessor of preprocessors) {
      for (const level of preprocessor.levels) {
        const levelSet = this.preprocessors.get(level);
        if (levelSet) {
          levelSet.add(preprocessor);
        }
      }
    }
  }

  /**
   * Pre process content at specified level
   * @param level Level to process at
   * @param content Content to process
   * @returns Processed content
   */
  process(level: PreprocessLevel, content: T): T {
    const processors = this.preprocessors.get(level) ?? new Set();
    return Array.from(processors).reduce(
      (result, preprocessor) => preprocessor.preprocess(result),
      content
    );
  }
}
