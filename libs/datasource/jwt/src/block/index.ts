import type { BlockMetadata } from './indexer';

export type BlockSearchItem = Partial<
    BlockMetadata & {
        readonly content: string;
    }
>;

export { BaseBlock } from './base';
export type { Decoration, ReadableContentExporter } from './base';
export { BlockIndexer } from './indexer';
export type { BlockCapability } from './capability';
