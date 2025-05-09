import type { ServiceProvider } from '@blocksuite/global/di';
import { BlockSuiteError } from '@blocksuite/global/exceptions';

import {
  BlockModel,
  type DraftModel,
  type Store,
  toDraftModel,
} from '../model/index.js';
import type { AssetsManager } from '../transformer/assets.js';
import type { Slice, Transformer } from '../transformer/index.js';
import type {
  BlockSnapshot,
  DocSnapshot,
  SliceSnapshot,
} from '../transformer/type.js';
import { ASTWalkerContext } from './context.js';

export type FromDocSnapshotPayload = {
  snapshot: DocSnapshot;
  assets?: AssetsManager;
};
export type FromBlockSnapshotPayload = {
  snapshot: BlockSnapshot;
  assets?: AssetsManager;
};
export type FromSliceSnapshotPayload = {
  snapshot: SliceSnapshot;
  assets?: AssetsManager;
};
export type FromDocSnapshotResult<Target> = {
  file: Target;
  assetsIds: string[];
};
export type FromBlockSnapshotResult<Target> = {
  file: Target;
  assetsIds: string[];
};
export type FromSliceSnapshotResult<Target> = {
  file: Target;
  assetsIds: string[];
};
export type ToDocSnapshotPayload<Target> = {
  file: Target;
  assets?: AssetsManager;
};
export type ToBlockSnapshotPayload<Target> = {
  file: Target;
  assets?: AssetsManager;
};
export type ToSliceSnapshotPayload<Target> = {
  file: Target;
  assets?: AssetsManager;
};

export function wrapFakeNote(snapshot: SliceSnapshot) {
  if (snapshot.content[0]?.flavour !== 'affine:note') {
    snapshot.content = [
      {
        type: 'block',
        id: '',
        flavour: 'affine:note',
        props: {},
        children: snapshot.content,
      },
    ];
  }
}

export abstract class BaseAdapter<AdapterTarget = unknown> {
  job: Transformer;

  get configs() {
    return this.job.adapterConfigs;
  }

  constructor(
    job: Transformer,
    readonly provider: ServiceProvider
  ) {
    this.job = job;
  }

  async fromBlock(model: BlockModel | DraftModel) {
    try {
      const draftModel =
        model instanceof BlockModel ? toDraftModel(model) : model;
      const blockSnapshot = this.job.blockToSnapshot(draftModel);
      if (!blockSnapshot) return;
      return await this.fromBlockSnapshot({
        snapshot: blockSnapshot,
        assets: this.job.assetsManager,
      });
    } catch (error) {
      console.error('Cannot convert block to snapshot');
      console.error(error);
      return;
    }
  }

  abstract fromBlockSnapshot(
    payload: FromBlockSnapshotPayload
  ):
    | Promise<FromBlockSnapshotResult<AdapterTarget>>
    | FromBlockSnapshotResult<AdapterTarget>;

  async fromDoc(doc: Store) {
    try {
      const docSnapshot = this.job.docToSnapshot(doc);
      if (!docSnapshot) return;
      return await this.fromDocSnapshot({
        snapshot: docSnapshot,
        assets: this.job.assetsManager,
      });
    } catch (error) {
      console.error('Cannot convert doc to snapshot');
      console.error(error);
      return;
    }
  }

  abstract fromDocSnapshot(
    payload: FromDocSnapshotPayload
  ):
    | Promise<FromDocSnapshotResult<AdapterTarget>>
    | FromDocSnapshotResult<AdapterTarget>;

  async fromSlice(slice: Slice) {
    try {
      const sliceSnapshot = this.job.sliceToSnapshot(slice);
      if (!sliceSnapshot) return;
      wrapFakeNote(sliceSnapshot);
      return await this.fromSliceSnapshot({
        snapshot: sliceSnapshot,
        assets: this.job.assetsManager,
      });
    } catch (error) {
      console.error('Cannot convert slice to snapshot');
      console.error(error);
      return;
    }
  }

  abstract fromSliceSnapshot(
    payload: FromSliceSnapshotPayload
  ):
    | Promise<FromSliceSnapshotResult<AdapterTarget>>
    | FromSliceSnapshotResult<AdapterTarget>;

  async toBlock(
    payload: ToBlockSnapshotPayload<AdapterTarget>,
    doc: Store,
    parent?: string,
    index?: number
  ) {
    try {
      const snapshot = await this.toBlockSnapshot(payload);
      if (!snapshot) return;
      return await this.job.snapshotToBlock(snapshot, doc, parent, index);
    } catch (error) {
      console.error('Cannot convert block snapshot to block');
      console.error(error);
      return;
    }
  }

  abstract toBlockSnapshot(
    payload: ToBlockSnapshotPayload<AdapterTarget>
  ): Promise<BlockSnapshot> | BlockSnapshot;

  async toDoc(payload: ToDocSnapshotPayload<AdapterTarget>) {
    try {
      const snapshot = await this.toDocSnapshot(payload);
      if (!snapshot) return;
      return await this.job.snapshotToDoc(snapshot);
    } catch (error) {
      console.error('Cannot convert doc snapshot to doc');
      console.error(error);
      return;
    }
  }

  abstract toDocSnapshot(
    payload: ToDocSnapshotPayload<AdapterTarget>
  ): Promise<DocSnapshot> | DocSnapshot;

  async toSlice(
    payload: ToSliceSnapshotPayload<AdapterTarget>,
    doc: Store,
    parent?: string,
    index?: number
  ) {
    try {
      const snapshot = await this.toSliceSnapshot(payload);
      if (!snapshot) return;
      return await this.job.snapshotToSlice(snapshot, doc, parent, index);
    } catch (error) {
      console.error('Cannot convert slice snapshot to slice');
      console.error(error);
      return;
    }
  }

  abstract toSliceSnapshot(
    payload: ToSliceSnapshotPayload<AdapterTarget>
  ): Promise<SliceSnapshot | null> | SliceSnapshot | null;
}

type Keyof<T> = T extends unknown ? keyof T : never;

type WalkerFn<ONode extends object, TNode extends object> = (
  o: NodeProps<ONode>,
  context: ASTWalkerContext<TNode>
) => Promise<void> | void;

export type NodeProps<Node extends object> = {
  node: Node;
  next?: Node | null;
  parent: NodeProps<Node> | null;
  prop: Keyof<Node> | null;
  index: number | null;
};

// Ported from https://github.com/Rich-Harris/estree-walker MIT License
export class ASTWalker<ONode extends object, TNode extends object | never> {
  private _enter: WalkerFn<ONode, TNode> | undefined;

  private _isONode!: (node: unknown) => node is ONode;

  private _leave: WalkerFn<ONode, TNode> | undefined;

  private readonly _visit = async (o: NodeProps<ONode>) => {
    if (!o.node) return;
    this.context._skipChildrenNum = 0;
    this.context._skip = false;

    if (this._enter) {
      await this._enter(o, this.context);
    }

    if (this.context._skip) {
      if (this._leave) {
        await this._leave(o, this.context);
      }
      return;
    }

    for (const key in o.node) {
      const value = o.node[key];

      if (value && typeof value === 'object') {
        if (Array.isArray(value)) {
          for (
            let i = this.context._skipChildrenNum;
            i < value.length;
            i += 1
          ) {
            const item = value[i];
            if (
              item !== null &&
              typeof item === 'object' &&
              this._isONode(item)
            ) {
              const nextItem = value[i + 1] ?? null;
              await this._visit({
                node: item,
                next: nextItem,
                parent: o,
                prop: key as unknown as Keyof<ONode>,
                index: i,
              });
            }
          }
        } else if (
          this.context._skipChildrenNum === 0 &&
          this._isONode(value)
        ) {
          await this._visit({
            node: value,
            next: null,
            parent: o,
            prop: key as unknown as Keyof<ONode>,
            index: null,
          });
        }
      }
    }

    if (this._leave) {
      await this._leave(o, this.context);
    }
  };

  private readonly context: ASTWalkerContext<TNode>;

  setEnter = (fn: WalkerFn<ONode, TNode>) => {
    this._enter = fn;
  };

  setLeave = (fn: WalkerFn<ONode, TNode>) => {
    this._leave = fn;
  };

  setONodeTypeGuard = (fn: (node: unknown) => node is ONode) => {
    this._isONode = fn;
  };

  walk = async (oNode: ONode, tNode: TNode) => {
    this.context.openNode(tNode);
    await this._visit({ node: oNode, parent: null, prop: null, index: null });
    if (this.context.stack.length !== 1) {
      throw new BlockSuiteError(1, 'There are unclosed nodes');
    }
    return this.context.currentNode();
  };

  walkONode = async (oNode: ONode) => {
    await this._visit({ node: oNode, parent: null, prop: null, index: null });
  };

  constructor() {
    this.context = new ASTWalkerContext<TNode>();
  }
}
