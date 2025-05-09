import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import * as Y from 'yjs';

import { isPureObject, native2Y } from '../../reactive/index.js';
import type { Schema } from '../../schema/index.js';
import type { BlockModel } from '../block/block-model.js';
import type { YBlock } from '../block/types.js';
import { internalPrimitives } from '../block/zod.js';

export class DocCRUD {
  get root(): string | null {
    let rootId: string | null = null;
    this._yBlocks.forEach(yBlock => {
      const flavour = yBlock.get('sys:flavour') as string;
      const schema = this._schema.flavourSchemaMap.get(flavour);
      if (!schema) return;

      if (schema.model.role === 'root') {
        rootId = yBlock.get('sys:id') as string;
      }
    });
    return rootId;
  }

  constructor(
    private readonly _yBlocks: Y.Map<YBlock>,
    private readonly _schema: Schema
  ) {}

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

    const findParent = (parentId: string): string | null => {
      const parentYBlock = this._yBlocks.get(parentId);
      if (!parentYBlock) return null;

      const children = parentYBlock.get('sys:children');

      for (const childId of children.toArray()) {
        if (childId === targetId) return parentId;

        const parent = findParent(childId);
        if (parent != null) return parent;
      }

      return null;
    };

    return findParent(root);
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
