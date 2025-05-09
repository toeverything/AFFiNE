import { createIdentifier, type ServiceProvider } from '@blocksuite/global/di';
import {
  type AssetsManager,
  type ASTWalker,
  type ASTWalkerContext,
  type BaseAdapter,
  type BlockSnapshot,
  BlockSnapshotSchema,
  type NodeProps,
  type Transformer,
} from '@blocksuite/store';

import type { DeltaASTConverter } from './delta-converter.js';

export const isBlockSnapshotNode = (node: unknown): node is BlockSnapshot =>
  BlockSnapshotSchema.safeParse(node).success;

export type TextBuffer = {
  content: string;
};

export type AdapterContext<
  ONode extends object,
  TNode extends object = never,
  TConverter extends DeltaASTConverter = DeltaASTConverter,
> = {
  walker: ASTWalker<ONode, TNode>;
  walkerContext: ASTWalkerContext<TNode>;
  configs: Map<string, string>;
  job: Transformer;
  deltaConverter: TConverter;
  textBuffer: TextBuffer;
  provider?: ServiceProvider;
  assets?: AssetsManager;
  pageMap?: Map<string, string>;
  updateAssetIds?: (assetsId: string) => void;
};

/**
 * Defines the interface for adapting between different blocks and target formats.
 * Used to convert blocks between a source format (TNode) and BlockSnapshot format.
 *
 * @template TNode - The source/target node type to convert from/to
 * @template TConverter - The converter used for handling delta format conversions
 */
export type BlockAdapterMatcher<
  TNode extends object = never,
  TConverter extends DeltaASTConverter = DeltaASTConverter,
> = {
  /** The block flavour identifier */
  flavour: string;

  /**
   * Function to check if a target node matches this adapter
   * @param o - The target node properties to check
   * @returns true if this adapter can handle the node
   */
  toMatch: (o: NodeProps<TNode>) => boolean;

  /**
   * Function to check if a BlockSnapshot matches this adapter
   * @param o - The BlockSnapshot properties to check
   * @returns true if this adapter can handle the snapshot
   */
  fromMatch: (o: NodeProps<BlockSnapshot>) => boolean;

  /**
   * Handlers for converting from target format to BlockSnapshot
   */
  toBlockSnapshot: {
    /**
     * Called when entering a target walker node during traversal
     * @param o - The target node properties
     * @param context - The adapter context
     */
    enter?: (
      o: NodeProps<TNode>,
      context: AdapterContext<TNode, BlockSnapshot, TConverter>
    ) => void | Promise<void>;

    /**
     * Called when leaving a target walker node during traversal
     * @param o - The target node properties
     * @param context - The adapter context
     */
    leave?: (
      o: NodeProps<TNode>,
      context: AdapterContext<TNode, BlockSnapshot, TConverter>
    ) => void | Promise<void>;
  };

  /**
   * Handlers for converting from BlockSnapshot to target format
   */
  fromBlockSnapshot: {
    /**
     * Called when entering a BlockSnapshot walker node during traversal
     * @param o - The BlockSnapshot properties
     * @param context - The adapter context
     */
    enter?: (
      o: NodeProps<BlockSnapshot>,
      context: AdapterContext<BlockSnapshot, TNode, TConverter>
    ) => void | Promise<void>;

    /**
     * Called when leaving a BlockSnapshot walker node during traversal
     * @param o - The BlockSnapshot properties
     * @param context - The adapter context
     */
    leave?: (
      o: NodeProps<BlockSnapshot>,
      context: AdapterContext<BlockSnapshot, TNode, TConverter>
    ) => void | Promise<void>;
  };
};

export type AdapterFactory = {
  // TODO(@chen): Make it return the specific adapter type
  get: (job: Transformer) => BaseAdapter;
};

export const AdapterFactoryIdentifier =
  createIdentifier<AdapterFactory>('AdapterFactory');
