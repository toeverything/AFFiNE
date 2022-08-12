import type { BlockMetadata } from './indexer';

export type BlockSearchItem = Partial<
    BlockMetadata & {
        readonly content: string;
    }
>;

export { BaseBlock } from './base';
export type { Decoration, ReadableContentExporter } from './base';
export type { BlockCapability } from './capability';
export { BlockIndexer } from './indexer';
