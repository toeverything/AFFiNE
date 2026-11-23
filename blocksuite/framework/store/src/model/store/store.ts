import { Container, type ServiceProvider } from '@blocksuite/global/di';
import { DisposableGroup } from '@blocksuite/global/disposable';
import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import { computed, signal } from '@preact/signals-core';
import { Subject } from 'rxjs';
import * as Y from 'yjs';

import type { ExtensionType } from '../../extension/extension.js';
import {
  BlockSchemaIdentifier,
  type Doc,
  HistoryExtension,
  StoreExtensionIdentifier,
  StoreSelectionExtension,
} from '../../extension/index.js';
import { DocIdentifier } from '../../extension/workspace/doc.js';
import { Schema } from '../../schema/index.js';
import type { TransformerMiddleware } from '../../transformer/middleware.js';
import { Transformer } from '../../transformer/transformer.js';
import {
  Block,
  type BlockModel,
  type BlockOptions,
  type BlockProps,
  type BlockSysProps,
  type PropsOfModel,
  type YBlock,
} from '../block/index.js';
import { DocCRUD } from './crud.js';
import { StoreIdentifier } from './identifier.js';
import { type Query, runQuery } from './query.js';
import { syncBlockProps } from './utils.js';

export type StoreOptions = {
  doc: Doc;
  id?: string;
  readonly?: boolean;
  query?: Query;
  provider?: ServiceProvider;
  extensions?: ExtensionType[];
};

type StoreBlockAddedPayload = {
  /**
   * The type of the event.
   */
  type: 'add';
  /**
   * The id of the block.
   */
  id: string;
  /**
   * Whether the event is triggered by local changes.
   */
  isLocal: boolean;
  /**
   * The flavour of the block.
   */
  flavour: string;
  /**
   * The model of the block.
   */
  model: BlockModel;
  /**
   * @internal
   * Whether the event is triggered by initialization.
   * FIXME: This seems not working as expected now.
   */
  init: boolean;
};

type StoreBlockDeletedPayload = {
  /**
   * The type of the event.
   */
  type: 'delete';
  /**
   * The id of the block.
   */
  id: string;
  /**
   * Whether the event is triggered by local changes.
   */
  isLocal: boolean;
  /**
   * The flavour of the block.
   */
  flavour: string;
  /**
   * The parent id of the block.
   */
  parent: string;
  /**
   * The model of the block.
   */
  model: BlockModel;
};

type StoreBlockUpdatedPayload = {
  /**
   * The type of the event.
   */
  type: 'update';
  /**
   * The id of the block.
   */
  id: string;
  /**
   * Whether the event is triggered by local changes.
   */
  isLocal: boolean;
  /**
   * The flavour of the block.
   */
  flavour: string;
  /**
   * The changed props of the block.
   */
  props: { key: string };
};

type StoreBlockUpdatedPayloads =
  | StoreBlockAddedPayload
  | StoreBlockDeletedPayload
  | StoreBlockUpdatedPayload;

/**
 * Slots for receiving events from the store.
 * All events are rxjs Subjects, you can subscribe to them like this:
 *
 * ```ts
 * store.slots.ready.subscribe(() => {
 *   console.log('store is ready');
 * });
 * ```
 *
 * You can also use rxjs operators to handle the events.
 *
 * @interface
 * @category Store
 */
export type StoreSlots = {
  /**
   * This fires after `doc.load` is called.
   * The Y.Doc is fully loaded and ready to use.
   */
  ready: Subject<void>;
  /**
   * This fires when the root block is added via API call or has just been initialized from existing ydoc.
   * useful for internal block UI components to start subscribing following up events.
   * Note that at this moment, the whole block tree may not be fully initialized yet.
   */
  rootAdded: Subject<string>;
  /**
   * This fires when the root block is deleted via API call or has just been removed from existing ydoc.
   * In most cases, you don't need to subscribe to this event.
   */
  rootDeleted: Subject<string>;
  /**
   * This fires when a block is updated via API call or has just been updated from existing ydoc.
   *
   * The payload can have three types:
   * - add: When a new block is added
   * - delete: When a block is removed
   * - update: When a block's properties are modified
   *
   */
  blockUpdated: Subject<StoreBlockUpdatedPayloads>;
  /** @internal */
  yBlockUpdated: Subject<
    | {
        type: 'add';
        id: string;
        isLocal: boolean;
      }
    | {
        type: 'delete';
        id: string;
        isLocal: boolean;
      }
  >;
};

const internalExtensions = [StoreSelectionExtension, HistoryExtension];

/**
 * Core store class that manages blocks and their lifecycle in BlockSuite
 * @remarks
 * The Store class is responsible for managing the lifecycle of blocks, handling transactions,
 * and maintaining the block tree structure.
 * A store is a piece of data created from one or a part of a Y.Doc.
 *
 * @category Store
 */
export class Store {
  /** @internal */
  readonly userExtensions: ExtensionType[];

  /**
   * Group of disposable resources managed by the store
   *
   * @category Store Lifecycle
   */
  disposableGroup = new DisposableGroup();

  private readonly _provider: ServiceProvider;

  private _shouldTransact = true;

  private readonly _runQuery = (block: Block) => {
    runQuery(this._query, block);
  };

  private readonly _doc: Doc;

  private readonly _blocks = signal<Record<string, Block>>({});

  private readonly _crud: DocCRUD;

  private readonly _query: Query = {
    match: [],
    mode: 'loose',
  };

  private readonly _readonly = signal(false);

  private readonly _isEmpty = computed(() => {
    return this.root?.isEmpty() ?? true;
  });

  private readonly _schema: Schema;

  /**
   * Get the id of the store.
   *
   * @category Store Lifecycle
   */
  get id() {
    return this._doc.id;
  }

  /**
   * {@inheritDoc StoreSlots}
   *
   * @category Store Lifecycle
   */
  readonly slots: StoreSlots;

  private get _yBlocks() {
    return this._doc.yBlocks;
  }

  /**
   * Get the {@link AwarenessStore} instance for current store
   */
  get awarenessStore() {
    return this._doc.awarenessStore;
  }

  /**
   * Get the di provider for current store.
   *
   * @category Extension
   */
  get provider() {
    return this._provider;
  }

  /**
   * Get the {@link BlobEngine} instance for current store.
   */
  get blobSync() {
    return this.workspace.blobSync;
  }

  /**
   * Get the {@link Doc} instance for current store.
   */
  get doc() {
    return this._doc;
  }

  /**
   * @internal
   */
  get blocks() {
    return this._blocks;
  }

  /**
   * Get the number of blocks in the store
   *
   * @category Block CRUD
   */
  get blockSize() {
    return Object.values(this._blocks.peek()).length;
  }

  /**
   * Check if the store can redo
   *
   * @category History
   */
  get canRedo() {
    if (this.readonly) {
      return false;
    }
    return this._history.canRedo;
  }

  /**
   * Check if the store can undo
   *
   * @category History
   */
  get canUndo() {
    if (this.readonly) {
      return false;
    }
    return this._history.canUndo;
  }

  /**
   * Undo the last transaction.
   *
   * @category History
   */
  undo = () => {
    if (this.readonly) {
      console.error('cannot undo in readonly mode');
      return;
    }
    this._history.undoManager.undo();
  };

  /**
   * Redo the last undone transaction.
   *
   * @category History
   */
  redo = () => {
    if (this.readonly) {
      console.error('cannot undo in readonly mode');
      return;
    }
    this._history.undoManager.redo();
  };

  /**
   * Reset the history of the store.
   *
   * @category History
   */
  resetHistory = () => {
    return this._history.undoManager.clear();
  };

  /**
   * Execute a transaction.
   *
   * @example
   * ```ts
   * store.transact(() => {
   *   op1();
   *   op2();
   * });
   * ```
   *
   * @category History
   */
  transact(fn: () => void, shouldTransact: boolean = this._shouldTransact) {
    const spaceDoc = this._doc.spaceDoc;
    spaceDoc.transact(
      () => {
        try {
          fn();
        } catch (e) {
          console.error(
            `An error occurred while Y.doc ${spaceDoc.guid} transacting:`
          );
          console.error(e);
        }
      },
      shouldTransact ? this.spaceDoc.clientID : null
    );
  }

  /**
   * Execute a transaction without capturing the history.
   *
   * @example
   * ```ts
   * store.withoutTransact(() => {
   *   op1();
   *   op2();
   * });
   * ```
   *
   * @category History
   */
  withoutTransact(fn: () => void) {
    this._shouldTransact = false;
    fn();
    this._shouldTransact = true;
  }

  /**
   * Force the following history to be captured into a new stack.
   *
   * @example
   * ```ts
   * op1();
   * op2();
   * store.captureSync();
   * op3();
   *
   * store.undo(); // undo op3
   * store.undo(); // undo op1, op2
   * ```
   *
   * @category History
   */
  captureSync = () => {
    this._history.undoManager.stopCapturing();
  };

  /**
   * Get the {@link Workspace} instance for current store.
   */
  get workspace() {
    return this._doc.workspace;
  }

  /**
   * Get the {@link Y.UndoManager} instance for current store.
   *
   * @category History
   */
  get history() {
    return this._history;
  }

  /**
   * Check if there are no blocks in the store.
   *
   * @category Block CRUD
   */
  get isEmpty() {
    return this._isEmpty.peek();
  }

  /**
   * Get the signal for the empty state of the store.
   *
   * @category Block CRUD
   */
  get isEmpty$() {
    return this._isEmpty;
  }

  /**
   * Check if the store is loaded.
   *
   * @category Store Lifecycle
   */
  get loaded() {
    return this._doc.loaded;
  }

  /**
   * Get the meta data of the store.
   *
   * @internal
   */
  get meta() {
    return this._doc.meta;
  }

  /**
   * Check if the store is readonly.
   *
   * @category Block CRUD
   */
  get readonly() {
    return this._readonly.value === true;
  }

  /**
   * Get the signal for the readonly state of the store.
   *
   * @category Block CRUD
   */
  get readonly$() {
    return this._readonly;
  }

  /**
   * Set the readonly state of the store.
   *
   * @category Block CRUD
   */
  set readonly(value: boolean) {
    this._readonly.value = value;
  }

  /**
   * Check if the store is ready.
   * Which means the Y.Doc is loaded and the root block is added.
   *
   * @category Store Lifecycle
   */
  get ready() {
    return this._doc.ready;
  }

  /**
   * Get the root block of the store.
   *
   * @category Block CRUD
   */
  get root() {
    const rootId = this._crud.root;
    if (!rootId) return null;
    return this.getBlock(rootId)?.model ?? null;
  }

  /**
   * @internal
   * Get the root Y.Doc of sub Y.Doc.
   * In the current design, store is on a sub Y.Doc, and all sub docs have the same root Y.Doc.
   */
  get rootDoc() {
    return this._doc.rootDoc;
  }

  /**
   * Get the {@link Schema} instance of the store.
   */
  get schema() {
    return this._schema;
  }

  /**
   * @internal
   * Get the Y.Doc instance of the store.
   */
  get spaceDoc() {
    return this._doc.spaceDoc;
  }

  private _isDisposed = false;

  private get _history() {
    return this._provider.get(HistoryExtension);
  }

  /**
   * @internal
   * In most cases, you don't need to use the constructor directly.
   * The store is created by the {@link Doc} instance.
   */
  constructor({ readonly, query, provider, extensions }: StoreOptions) {
    this.slots = {
      ready: new Subject(),
      rootAdded: new Subject(),
      rootDeleted: new Subject(),
      blockUpdated: new Subject(),
      yBlockUpdated: new Subject(),
    };
    this._schema = new Schema();

    const container = new Container();
    container.addImpl(StoreIdentifier, () => this);

    internalExtensions.forEach(ext => {
      ext.setup(container);
    });

    const userExtensions = extensions ?? [];
    this.userExtensions = userExtensions;
    userExtensions.forEach(extension => {
      extension.setup(container);
    });

    this._provider = container.provider(undefined, provider);
    this._provider.getAll(BlockSchemaIdentifier).forEach(schema => {
      this._schema.register([schema]);
    });
    this._doc = this._provider.get(DocIdentifier);
    this._crud = new DocCRUD(this._yBlocks, this._schema);
    if (readonly !== undefined) {
      this._readonly.value = readonly;
    }
    if (query) {
      this._query = query;
    }

    this._yBlocks.observeDeep(this._handleYEvents);
    this._yBlocks.forEach((_, id) => {
      this._handleYBlockAdd(id, false);

      if (id in this._blocks.peek()) {
        return;
      }
      this._onBlockAdded(id, false, true);
    });

    this._subscribeToSlots();
  }

  private readonly _subscribeToSlots = () => {
    this.disposableGroup.add(
      this.slots.yBlockUpdated.subscribe(({ type, id, isLocal }) => {
        switch (type) {
          case 'add': {
            this._onBlockAdded(id, isLocal, false);
            return;
          }
          case 'delete': {
            this._onBlockRemoved(id, isLocal);
            return;
          }
        }
      })
    );
    this.disposableGroup.add(this.slots.ready);
    this.disposableGroup.add(this.slots.blockUpdated);
    this.disposableGroup.add(this.slots.rootAdded);
    this.disposableGroup.add(this.slots.rootDeleted);
  };

  private _getSiblings<T>(
    block: BlockModel | string,
    fn: (parent: BlockModel, index: number) => T
  ) {
    const parent = this.getParent(block);
    if (!parent) return null;

    const blockModel =
      typeof block === 'string' ? this.getBlock(block)?.model : block;
    if (!blockModel) return null;

    const index = parent.children.indexOf(blockModel);
    if (index === -1) return null;

    return fn(parent, index);
  }

  private _onBlockAdded(id: string, isLocal: boolean, init: boolean) {
    try {
      if (id in this._blocks.peek()) {
        return;
      }
      const yBlock = this._yBlocks.get(id);
      if (!yBlock) {
        console.warn(`Could not find block with id ${id}`);
        return;
      }

      const options: BlockOptions = {
        onChange: (block, key, isLocal) => {
          if (key) {
            block.model.propsUpdated.next({ key });
          }

          this.slots.blockUpdated.next({
            type: 'update',
            id,
            flavour: block.flavour,
            props: { key },
            isLocal,
          });
        },
      };

      const block = new Block(this._schema, yBlock, this, options);
      this._runQuery(block);

      this._blocks.value = {
        ...this._blocks.value,
        [id]: block,
      };
      block.model.created.next();

      if (block.model.role === 'root') {
        this.slots.rootAdded.next(id);
      }

      this.slots.blockUpdated.next({
        type: 'add',
        id,
        init,
        flavour: block.model.flavour,
        model: block.model,
        isLocal,
      });
    } catch (e) {
      console.error('An error occurred while adding block:');
      console.error(e);
    }
  }

  private _onBlockRemoved(id: string, isLocal: boolean) {
    try {
      const block = this.getBlock(id);
      if (!block) return;

      if (block.model.role === 'root') {
        this.slots.rootDeleted.next(id);
      }

      this.slots.blockUpdated.next({
        type: 'delete',
        id,
        flavour: block.flavour,
        parent: this.getParent(block.model)?.id ?? '',
        model: block.model,
        isLocal,
      });

      const { [id]: _, ...blocks } = this._blocks.peek();
      this._blocks.value = blocks;

      block.model.deleted.next();
      block.model.dispose();
    } catch (e) {
      console.error('An error occurred while removing block:');
      console.error(e);
    }
  }

  /**
   * Creates and adds a new block to the store
   * @param flavour - The block's flavour (type)
   * @param blockProps - Optional properties for the new block
   * @param parent - Optional parent block or parent block ID
   * @param parentIndex - Optional index position in parent's children
   * @returns The ID of the newly created block
   * @throws {BlockSuiteError} When store is in readonly mode
   *
   * @category Block CRUD
   */
  addBlock<T extends BlockModel = BlockModel>(
    flavour: string,
    blockProps: Partial<(PropsOfModel<T> & BlockSysProps) | BlockProps> = {},
    parent?: BlockModel | string | null,
    parentIndex?: number
  ): string {
    if (this.readonly) {
      throw new BlockSuiteError(
        ErrorCode.ModelCRUDError,
        'cannot modify data in readonly mode'
      );
    }

    const id = blockProps.id ?? this._doc.workspace.idGenerator();

    this.transact(() => {
      this._crud.addBlock(
        id,
        flavour,
        { ...blockProps },
        typeof parent === 'string' ? parent : parent?.id,
        parentIndex
      );
    });

    return id;
  }

  /**
   * Add multiple blocks to the store
   * @param blocks - Array of blocks to add
   * @param parent - Optional parent block or parent block ID
   * @param parentIndex - Optional index position in parent's children
   * @returns Array of IDs of the newly created blocks
   *
   * @category Block CRUD
   */
  addBlocks(
    blocks: Array<{
      flavour: string;
      blockProps?: Partial<BlockProps & Omit<BlockProps, 'flavour' | 'id'>>;
    }>,
    parent?: BlockModel | string | null,
    parentIndex?: number
  ): string[] {
    const ids: string[] = [];
    blocks.forEach(block => {
      const id = this.addBlock(
        block.flavour as never,
        block.blockProps ?? {},
        parent,
        parentIndex
      );
      ids.push(id);
      typeof parentIndex === 'number' && parentIndex++;
    });

    return ids;
  }

  /**
   * Add sibling blocks to the store
   * @param targetModel - The target block model
   * @param props - Array of block properties
   * @param placement - Optional position to place the new blocks ('after' or 'before')
   * @returns Array of IDs of the newly created blocks
   *
   * @category Block CRUD
   */
  addSiblingBlocks(
    targetModel: BlockModel,
    props: Array<Partial<BlockProps>>,
    placement: 'after' | 'before' = 'after'
  ): string[] {
    if (!props.length) return [];
    const parent = this.getParent(targetModel);
    if (!parent) return [];

    const targetIndex =
      parent.children.findIndex(({ id }) => id === targetModel.id) ?? 0;
    const insertIndex = placement === 'before' ? targetIndex : targetIndex + 1;

    if (props.length <= 1) {
      if (!props[0]?.flavour) return [];
      const { flavour, ...blockProps } = props[0];
      const id = this.addBlock(
        flavour as never,
        blockProps,
        parent.id,
        insertIndex
      );
      return [id];
    }

    const blocks: Array<{
      flavour: string;
      blockProps: Partial<BlockProps>;
    }> = [];
    props.forEach(prop => {
      const { flavour, ...blockProps } = prop;
      if (!flavour) return;
      blocks.push({ flavour, blockProps });
    });
    return this.addBlocks(blocks, parent.id, insertIndex);
  }

  /**
   * Updates a block's properties or executes a callback in a transaction
   * @param modelOrId - The block model or block ID to update
   * @param callBackOrProps - Either a callback function to execute or properties to update
   * @throws {BlockSuiteError} When the block is not found or schema validation fails
   *
   * @category Block CRUD
   */

  updateBlock<T extends BlockModel = BlockModel>(
    modelOrId: T | string,
    callBackOrProps:
      | (() => void)
      | Partial<(PropsOfModel<T> & BlockSysProps) | BlockProps>
  ) {
    if (this.readonly) {
      console.error('cannot modify data in readonly mode');
      return;
    }

    const isCallback = typeof callBackOrProps === 'function';

    const model =
      typeof modelOrId === 'string'
        ? this.getBlock(modelOrId)?.model
        : modelOrId;
    if (!model) {
      throw new BlockSuiteError(
        ErrorCode.ModelCRUDError,
        `updating block: ${modelOrId} not found`
      );
    }

    if (!isCallback) {
      const parent = this.getParent(model);
      this.schema.validate(
        model.flavour,
        parent?.flavour,
        callBackOrProps.children?.map(child => child.flavour)
      );
    }

    const yBlock = this._yBlocks.get(model.id);
    if (!yBlock) {
      throw new BlockSuiteError(
        ErrorCode.ModelCRUDError,
        `updating block: ${model.id} not found`
      );
    }

    const block = this.getBlock(model.id);
    if (!block) return;

    this.transact(() => {
      if (isCallback) {
        callBackOrProps();
        this._runQuery(block);
        return;
      }

      if (callBackOrProps.children) {
        this._crud.updateBlockChildren(
          model.id,
          callBackOrProps.children.map(child => child.id)
        );
      }

      const schema = this.schema.flavourSchemaMap.get(model.flavour);
      if (!schema) {
        throw new BlockSuiteError(
          ErrorCode.ModelCRUDError,
          `schema for flavour: ${model.flavour} not found`
        );
      }
      syncBlockProps(schema, model, yBlock, callBackOrProps);
      this._runQuery(block);
      return;
    });
  }

  /**
   * Delete a block from the store
   * @param model - The block model or block ID to delete
   * @param options - Optional options for the deletion
   * @param options.bringChildrenTo - Optional block model to bring children to
   * @param options.deleteChildren - Optional flag to delete children
   *
   * @category Block CRUD
   */
  deleteBlock(
    model: BlockModel | string,
    options: {
      bringChildrenTo?: BlockModel;
      deleteChildren?: boolean;
    } = {
      deleteChildren: true,
    }
  ) {
    if (this.readonly) {
      console.error('cannot modify data in readonly mode');
      return;
    }

    const opts = (
      options && options.bringChildrenTo
        ? {
            ...options,
            bringChildrenTo: options.bringChildrenTo.id,
          }
        : options
    ) as {
      bringChildrenTo?: string;
      deleteChildren?: boolean;
    };

    this.transact(() => {
      this._crud.deleteBlock(
        typeof model === 'string' ? model : model.id,
        opts
      );
    });
  }

  /**
   * Gets a block by its ID
   * @param id - The block's ID
   * @returns The block instance if found, undefined otherwise
   *
   * @category Block CRUD
   */
  getBlock(id: string): Block | undefined {
    return this._blocks.peek()[id];
  }

  /**
   * Gets a block by its ID
   * @param id - The block's ID
   * @returns The block instance in signal if found, undefined otherwise
   *
   * @category Block CRUD
   */
  getBlock$(id: string): Block | undefined {
    return this._blocks.value[id];
  }

  /**
   * Get a model by its ID
   * @param id - The model's ID
   * @returns The model instance if found, null otherwise
   *
   * @category Block CRUD
   */
  getModelById<Model extends BlockModel = BlockModel>(
    id: string
  ): Model | null {
    return (this.getBlock(id)?.model ?? null) as Model | null;
  }

  /**
   * Gets all blocks of specified flavour(s)
   * @param blockFlavour - Single flavour or array of flavours to filter by
   * @returns Array of matching blocks
   *
   * @category Block CRUD
   */
  getBlocksByFlavour(blockFlavour: string | string[]): Block[] {
    const flavours =
      typeof blockFlavour === 'string' ? [blockFlavour] : blockFlavour;

    return Object.values(this._blocks.peek()).filter(({ flavour }) =>
      flavours.includes(flavour)
    );
  }

  /**
   * Get all models in the store
   * @returns Array of all models
   *
   * @category Block CRUD
   */
  getAllModels() {
    return Object.values(this._blocks.peek()).map(block => block.model);
  }

  /**
   * Get all models of specified flavour(s)
   * @param blockFlavour - Single flavour or array of flavours to filter by
   * @returns Array of matching models
   *
   * @category Block CRUD
   */
  getModelsByFlavour(blockFlavour: string | string[]): BlockModel[] {
    return this.getBlocksByFlavour(blockFlavour).map(x => x.model);
  }

  /**
   * Gets the parent block of a given block
   * @param target - Block model or block ID to find parent for
   * @returns The parent block model if found, null otherwise
   *
   * @category Block CRUD
   */
  getParent(target: BlockModel | string): BlockModel | null {
    const targetId = typeof target === 'string' ? target : target.id;
    const parentId = this._crud.getParent(targetId);
    if (!parentId) return null;

    const parent = this._blocks.peek()[parentId];
    if (!parent) return null;

    return parent.model;
  }

  /**
   * Get the previous sibling block of a given block
   * @param block - Block model or block ID to find previous sibling for
   * @returns The previous sibling block model if found, null otherwise
   *
   * @category Block CRUD
   */
  getPrev(block: BlockModel | string) {
    return this._getSiblings(
      block,
      (parent, index) => parent.children[index - 1] ?? null
    );
  }

  /**
   * Get all previous sibling blocks of a given block
   * @param block - Block model or block ID to find previous siblings for
   * @returns Array of previous sibling blocks if found, empty array otherwise
   *
   * @category Block CRUD
   */
  getPrevs(block: BlockModel | string) {
    return (
      this._getSiblings(block, (parent, index) =>
        parent.children.slice(0, index)
      ) ?? []
    );
  }

  /**
   * Get the next sibling block of a given block
   * @param block - Block model or block ID to find next sibling for
   * @returns The next sibling block model if found, null otherwise
   *
   * @category Block CRUD
   */
  getNext(block: BlockModel | string) {
    return this._getSiblings(
      block,
      (parent, index) => parent.children[index + 1] ?? null
    );
  }

  /**
   * Get all next sibling blocks of a given block
   * @param block - Block model or block ID to find next siblings for
   * @returns Array of next sibling blocks if found, empty array otherwise
   *
   * @category Block CRUD
   */
  getNexts(block: BlockModel | string) {
    return (
      this._getSiblings(block, (parent, index) =>
        parent.children.slice(index + 1)
      ) ?? []
    );
  }

  /**
   * Check if a block exists by its ID
   * @param id - The block's ID
   * @returns True if the block exists, false otherwise
   *
   * @category Block CRUD
   */
  hasBlock(id: string) {
    return id in this._blocks.peek();
  }

  /**
   * Move blocks to a new parent block
   * @param blocksToMove - Array of block models to move
   * @param newParent - The new parent block model
   * @param targetSibling - Optional target sibling block model
   * @param shouldInsertBeforeSibling - Optional flag to insert before sibling
   *
   * @category Block CRUD
   */
  moveBlocks(
    blocksToMove: BlockModel[],
    newParent: BlockModel,
    targetSibling: BlockModel | null = null,
    shouldInsertBeforeSibling = true
  ) {
    if (this.readonly) {
      console.error('Cannot modify data in read-only mode');
      return;
    }

    this.transact(() => {
      this._crud.moveBlocks(
        blocksToMove.map(model => model.id),
        newParent.id,
        targetSibling?.id ?? null,
        shouldInsertBeforeSibling
      );
    });
  }

  /**
   * Creates a new transformer instance for the store
   * @param middlewares - Optional array of transformer middlewares
   * @returns A new Transformer instance
   *
   * @category Transformer
   */
  getTransformer(middlewares: TransformerMiddleware[] = []) {
    return new Transformer({
      schema: this.schema,
      blobCRUD: this.workspace.blobSync,
      docCRUD: {
        create: (id: string) => this.workspace.createDoc(id).getStore({ id }),
        get: (id: string) =>
          this.workspace.getDoc(id)?.getStore({ id }) ?? null,
        delete: (id: string) => this.workspace.removeDoc(id),
      },
      middlewares,
    });
  }

  /**
   * Get an extension instance from the store
   * @returns The extension instance
   *
   * @example
   * ```ts
   * const extension = store.get(SomeExtension);
   * ```
   *
   * @category Extension
   */
  get get() {
    return this.provider.get.bind(this.provider);
  }

  /**
   * Optional get an extension instance from the store.
   * The major difference between `get` and `getOptional` is that `getOptional` will not throw an error if the extension is not found.
   *
   * @returns The extension instance
   *
   * @example
   * ```ts
   * const extension = store.getOptional(SomeExtension);
   * ```
   *
   * @category Extension
   */
  get getOptional() {
    return this.provider.getOptional.bind(this.provider);
  }

  /**
   * Initializes and loads the store
   * @param initFn - Optional initialization function
   * @returns The store instance
   *
   * @category Store Lifecycle
   */
  load(initFn?: () => void) {
    if (this._isDisposed) {
      this.disposableGroup = new DisposableGroup();
      this._subscribeToSlots();
      this._isDisposed = false;
    }

    this._doc.load(initFn);
    this._provider.getAll(StoreExtensionIdentifier).forEach(ext => {
      ext.loaded();
    });
    this.slots.ready.next();
    this.slots.rootAdded.next(this.root?.id ?? '');
    return this;
  }

  /**
   * Disposes the store and releases all resources
   *
   * @category Store Lifecycle
   */
  dispose() {
    this._provider.getAll(StoreExtensionIdentifier).forEach(ext => {
      ext.disposed();
    });
    if (this._doc.ready) {
      this._yBlocks.unobserveDeep(this._handleYEvents);
    }
    this.slots.ready.complete();
    this.slots.rootAdded.complete();
    this.slots.rootDeleted.complete();
    this.slots.blockUpdated.complete();
    this.slots.yBlockUpdated.complete();
    this.disposableGroup.dispose();
    this._isDisposed = true;
  }

  private _handleYBlockAdd(id: string, isLocal: boolean) {
    this.slots.yBlockUpdated.next({ type: 'add', id, isLocal });
  }

  private _handleYBlockDelete(id: string, isLocal: boolean) {
    this.slots.yBlockUpdated.next({ type: 'delete', id, isLocal });
  }

  private _handleYEvent(event: Y.YEvent<YBlock | Y.Text | Y.Array<unknown>>) {
    // event on top-level block store
    if (event.target !== this._yBlocks) {
      return;
    }
    const isLocal =
      !event.transaction.origin ||
      !this._yBlocks.doc ||
      event.transaction.origin instanceof Y.UndoManager ||
      event.transaction.origin.proxy
        ? true
        : event.transaction.origin === this._yBlocks.doc.clientID;
    event.keys.forEach((value, id) => {
      try {
        if (value.action === 'add') {
          this._handleYBlockAdd(id, isLocal);
          return;
        }
        if (value.action === 'delete') {
          this._handleYBlockDelete(id, isLocal);
          return;
        }
      } catch (e) {
        console.error('An error occurred while handling Yjs event:');
        console.error(e);
      }
    });
  }

  private readonly _handleYEvents = (events: Y.YEvent<YBlock | Y.Text>[]) => {
    events.forEach(event => this._handleYEvent(event));
  };
}
