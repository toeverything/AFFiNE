import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import * as Y from 'yjs';

import { isPureObject, native2Y } from '../../reactive/index.js';
import type { Schema } from '../../schema/index.js';
import type { BlockModel } from '../block/block-model.js';
import type { YBlock } from '../block/types.js';
import { internalPrimitives } from '../block/zod.js';

/**
 * Child id -> parent id for every block, shared by all `DocCRUD`s over the
 * same Yjs block map and rebuilt lazily after any structural change.
 *
 * `getParent` used to search the whole block tree from the root (and `root`
 * scanned every block) on every call. Both run several times per keystroke
 * and once per paragraph render, so on long pages typing spent about a third
 * of its time here and re-rendering the page was quadratic (999.18).
 */
interface ParentIndex {
  parents: Map<string, string> | null;
  /** False while the block map has no Y.Doc to watch: never cache then. */
  watched: boolean;
}

const parentIndexes = new WeakMap<Y.Map<YBlock>, ParentIndex>();

const isStructuralChange = (
  yBlocks: Y.Map<YBlock>,
  changed: Y.Transaction['changed']
) => {
  for (const [type, keys] of changed) {
    if ((type as unknown) === yBlocks) return true;
    if (keys.has('sys:children')) return true;
    if (type instanceof Y.Array && type._item?.parentSub === 'sys:children') {
      return true;
    }
  }
  return false;
};

function getParentIndex(yBlocks: Y.Map<YBlock>): ParentIndex {
  const existing = parentIndexes.get(yBlocks);
  if (existing?.watched) return existing;
  const index: ParentIndex = existing ?? { parents: null, watched: false };
  parentIndexes.set(yBlocks, index);
  // Any transaction that changes the structure (including remote updates
  // and undo, which bypass DocCRUD) invalidates the index before any
  // observer can read it.
  const doc = yBlocks.doc;
  if (doc) {
    doc.on('beforeObserverCalls', (transaction: Y.Transaction) => {
      if (isStructuralChange(yBlocks, transaction.changed)) {
        index.parents = null;
      }
    });
    index.watched = true;
  }
  return index;
}

export class DocCRUD {
  private _rootId: string | null = null;

  private readonly _parentIndex: ParentIndex;

  get root(): string | null {
    const cached = this._rootId;
    if (cached && this._isRoot(this._yBlocks.get(cached))) return cached;

    let rootId: string | null = null;
    this._yBlocks.forEach(yBlock => {
      if (this._isRoot(yBlock)) {
        rootId = yBlock.get('sys:id') as string;
      }
    });
    this._rootId = rootId;
    return rootId;
  }

  constructor(
    private readonly _yBlocks: Y.Map<YBlock>,
    private readonly _schema: Schema
  ) {
    this._parentIndex = getParentIndex(_yBlocks);
    // Structural edits made through this class invalidate the index both
    // before and after they run, so a lookup made part-way through (e.g.
    // `addBlock` resolving `root`) can never leave a stale index behind.
    for (const key of [
      'addBlock',
      'deleteBlock',
      'moveBlocks',
      'updateBlockChildren',
    ] as const) {
      const run = this[key].bind(this) as (...args: unknown[]) => unknown;
      (this as Record<string, unknown>)[key] = (...args: unknown[]) => {
        this._parentIndex.parents = null;
        try {
          return run(...args);
        } finally {
          this._parentIndex.parents = null;
        }
      };
    }
  }

  private _isRoot(yBlock: YBlock | undefined) {
    if (!yBlock) return false;
    const flavour = yBlock.get('sys:flavour') as string;
    return this._schema.flavourSchemaMap.get(flavour)?.model.role === 'root';
  }

  private _parents() {
    const index = this._parentIndex.watched
      ? this._parentIndex
      : getParentIndex(this._yBlocks);
    let parents = index.watched ? index.parents : null;
    if (!parents) {
      const built = new Map<string, string>();
      this._yBlocks.forEach((yBlock, id) => {
        const children = yBlock.get('sys:children');
        if (!(children instanceof Y.Array)) return;
        for (const childId of children.toArray()) {
          built.set(childId, id);
        }
      });
      parents = built;
      if (index.watched) index.parents = built;
    }
    return parents;
  }

  private _getSiblings<T>(
    id: string,
    fn: (index: number, parent: YBlock) => T
  ) {
    const parentId = this.getParent(id);
    if (!parentId) return null;
    const parent = this._yBlocks.get(parentId);
    if (!parent) return null;

    const children = parent.get('sys:children');
    const index = children.toArray().indexOf(id);
    if (index === -1) return null;

    return fn(index, parent);
  }

  addBlock(
    id: string,
    flavour: string,
    initialProps: Record<string, unknown> = {},
    parent?: string | null,
    parentIndex?: number
  ) {
    const schema = this._schema.flavourSchemaMap.get(flavour);
    if (!schema) {
      throw new BlockSuiteError(
        ErrorCode.ModelCRUDError,
        `schema for flavour: ${flavour} not found`
      );
    }

    const hasBlock = this._yBlocks.has(id);
    if (hasBlock) {
      throw new BlockSuiteError(
        ErrorCode.ModelCRUDError,
        `Should not add existing block: ${id}`
      );
    }

    const parentFlavour = parent
      ? this._yBlocks.get(parent)?.get('sys:flavour')
      : undefined;

    this._schema.validate(flavour, parentFlavour as string);

    const yBlock = new Y.Map() as YBlock;
    this._yBlocks.set(id, yBlock);

    const version = schema.version;
    const children = (
      initialProps.children as undefined | (string | BlockModel)[]
    )?.map(child => (typeof child === 'string' ? child : child.id));

    yBlock.set('sys:id', id);
    yBlock.set('sys:flavour', flavour);
    yBlock.set('sys:version', version);
    yBlock.set('sys:children', Y.Array.from(children ?? []));

    const defaultProps = schema.model.props?.(internalPrimitives) ?? {};
    const props = {
      ...defaultProps,
      ...initialProps,
    };

    delete props.id;
    delete props.flavour;
    delete props.children;

    const isFlatData = schema.model.isFlatData;
    if (isFlatData) {
      const run = (obj: unknown, basePath: string) => {
        if (isPureObject(obj)) {
          Object.entries(obj).forEach(([key, value]) => {
            const fullPath = basePath ? `${basePath}.${key}` : key;
            run(value, fullPath);
          });
        } else {
          yBlock.set(`prop:${basePath}`, native2Y(obj));
        }
      };
      run(props, '');
    } else {
      Object.entries(props).forEach(([key, value]) => {
        if (value === undefined) return;

        yBlock.set(`prop:${key}`, native2Y(value));
      });
    }

    const parentId =
      parent ?? (schema.model.role === 'root' ? null : this.root);

    if (!parentId) return;

    const yParent = this._yBlocks.get(parentId);
    if (!yParent) return;

    const yParentChildren = yParent.get('sys:children') as Y.Array<string>;
    const index =
      parentIndex != null
        ? parentIndex > yParentChildren.length
          ? yParentChildren.length
          : parentIndex
        : yParentChildren.length;
    yParentChildren.insert(index, [id]);
  }

  deleteBlock(
    id: string,
    options: {
      bringChildrenTo?: string;
      deleteChildren?: boolean;
    } = {
      deleteChildren: true,
    }
  ) {
    const { bringChildrenTo, deleteChildren } = options;
    if (bringChildrenTo && deleteChildren) {
      console.error(
        'Cannot bring children to another block and delete them at the same time'
      );
      return;
    }

    const yModel = this._yBlocks.get(id);
    if (!yModel) return;

    const yModelChildren = yModel.get('sys:children') as Y.Array<string>;

    const parent = this.getParent(id);

    if (!parent) return;
    const yParent = this._yBlocks.get(parent) as YBlock;
    const yParentChildren = yParent.get('sys:children') as Y.Array<string>;
    const modelIndex = yParentChildren.toArray().indexOf(id);

    if (modelIndex > -1) {
      yParentChildren.delete(modelIndex, 1);
    }

    const apply = () => {
      if (bringChildrenTo) {
        const bringChildrenToModel = () => {
          if (!bringChildrenTo) {
            throw new BlockSuiteError(
              ErrorCode.ModelCRUDError,
              'bringChildrenTo is not provided when deleting block'
            );
          }
          const model = this._yBlocks.get(bringChildrenTo);
          if (!model) return;
          const bringFlavour = model.get('sys:flavour');

          yModelChildren.forEach(child => {
            const childModel = this._yBlocks.get(child);
            if (!childModel) return;
            this._schema.validate(
              childModel.get('sys:flavour') as string,
              bringFlavour as string
            );
          });

          if (bringChildrenTo === parent) {
            // When bring children to parent, insert children to the original position of model
            yParentChildren.insert(modelIndex, yModelChildren.toArray());
            return;
          }

          const yBringChildrenTo = this._yBlocks.get(bringChildrenTo);
          if (!yBringChildrenTo) return;

          const yBringChildrenToChildren = yBringChildrenTo.get(
            'sys:children'
          ) as Y.Array<string>;
          yBringChildrenToChildren.push(yModelChildren.toArray());
        };

        bringChildrenToModel();
        return;
      }

      if (deleteChildren) {
        // delete children recursively
        const deleteById = (id: string) => {
          const yBlock = this._yBlocks.get(id) as YBlock;

          const yChildren = yBlock.get('sys:children') as Y.Array<string>;
          yChildren.forEach(id => deleteById(id));

          this._yBlocks.delete(id);
        };

        yModelChildren.forEach(id => deleteById(id));
      }
    };

    apply();

    this._yBlocks.delete(id);
  }

  getNext(id: string) {
    return this._getSiblings(
      id,
      (index, parent) =>
        parent
          .get('sys:children')
          .toArray()
          .at(index + 1) ?? null
    );
  }

  getParent(targetId: string): string | null {
    const root = this.root;
    if (!root || root === targetId) return null;

    return this._parents().get(targetId) ?? null;
  }

  getPrev(id: string) {
    return this._getSiblings(
      id,
      (index, parent) =>
        parent
          .get('sys:children')
          .toArray()
          .at(index - 1) ?? null
    );
  }

  moveBlocks(
    blocksToMove: string[],
    newParent: string,
    targetSibling: string | null = null,
    shouldInsertBeforeSibling = true
  ) {
    if (
      blocksToMove.length > 1 &&
      targetSibling &&
      blocksToMove.includes(targetSibling)
    ) {
      console.error(
        'Cannot move blocks when the target sibling is in the blocks to move'
      );
      return;
    }

    if (blocksToMove.length === 1 && targetSibling === blocksToMove[0]) {
      return;
    }

    if (blocksToMove.includes(newParent)) {
      console.error(
        'Cannot move blocks when the new parent is in the blocks to move'
      );
      return;
    }

    // A map to store parent block and their respective child blocks
    const childBlocksPerParent = new Map<string, string[]>();

    const parentBlock = this._yBlocks.get(newParent);
    if (!parentBlock) return;

    const parentFlavour = parentBlock.get('sys:flavour');

    blocksToMove.forEach(blockId => {
      const parent = this.getParent(blockId);
      if (!parent) return;

      const block = this._yBlocks.get(blockId);
      if (!block) return;

      this._schema.validate(
        block.get('sys:flavour') as string,
        parentFlavour as string
      );

      const children = childBlocksPerParent.get(parent);
      if (!children) {
        childBlocksPerParent.set(parent, [blockId]);
        return;
      }

      const last = children[children.length - 1];
      if (this.getNext(last) !== blockId) {
        throw new BlockSuiteError(
          ErrorCode.ModelCRUDError,
          'The blocks to move are not contiguous under their parent'
        );
      }

      children.push(blockId);
    });

    let insertIndex = 0;
    Array.from(childBlocksPerParent.entries()).forEach(
      ([parentBlock, blocksToMove], index) => {
        const targetParentBlock = this._yBlocks.get(newParent);
        if (!targetParentBlock) return;
        const targetParentChildren = targetParentBlock.get('sys:children');
        const sourceParentBlock = this._yBlocks.get(parentBlock);
        if (!sourceParentBlock) return;
        const sourceParentChildren = sourceParentBlock.get('sys:children');

        // Get the IDs of blocks to move
        // Remove the blocks from their current parent
        const startIndex = sourceParentChildren
          .toArray()
          .findIndex(id => id === blocksToMove[0]);
        sourceParentChildren.delete(startIndex, blocksToMove.length);

        const updateInsertIndex = () => {
          const first = index === 0;
          if (!first) {
            insertIndex++;
            return;
          }

          if (!targetSibling) {
            insertIndex = targetParentChildren.length;
            return;
          }

          let targetIndex = targetParentChildren
            .toArray()
            .findIndex(id => id === targetSibling);
          if (targetIndex === -1) {
            console.error('Target sibling not found, just insert to the end');
            targetIndex = targetParentChildren.length;
          }
          insertIndex = shouldInsertBeforeSibling
            ? targetIndex
            : targetIndex + 1;
        };

        updateInsertIndex();

        targetParentChildren.insert(insertIndex, blocksToMove);
      }
    );
  }

  updateBlockChildren(id: string, children: string[]) {
    const yBlock = this._yBlocks.get(id);
    if (!yBlock) return;

    const yChildrenArray = yBlock.get('sys:children') as Y.Array<string>;
    yChildrenArray.delete(0, yChildrenArray.length);
    yChildrenArray.push(children);
  }
}
