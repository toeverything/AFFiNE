import { DefaultTheme, NoteDisplayMode } from '@blocksuite/affine-model';
import type { ServiceProvider } from '@blocksuite/global/di';
import {
  type AssetsManager,
  ASTWalker,
  BaseAdapter,
  type BlockSnapshot,
  BlockSnapshotSchema,
  type DeltaInsert,
  type DocSnapshot,
  type ExtensionType,
  type FromBlockSnapshotPayload,
  type FromBlockSnapshotResult,
  type FromDocSnapshotPayload,
  type FromDocSnapshotResult,
  type FromSliceSnapshotPayload,
  type FromSliceSnapshotResult,
  nanoid,
  type SliceSnapshot,
  type ToBlockSnapshotPayload,
  type ToDocSnapshotPayload,
  type Transformer,
} from '@blocksuite/store';

import { MarkdownAdapter } from './markdown/markdown';
import { AdapterFactoryIdentifier } from './types/adapter';

export type MixText = string;

type MixTextToSliceSnapshotPayload = {
  file: MixText;
  assets?: AssetsManager;
  workspaceId: string;
  pageId: string;
};

export class MixTextAdapter extends BaseAdapter<MixText> {
  private readonly _markdownAdapter: MarkdownAdapter;

  constructor(job: Transformer, provider: ServiceProvider) {
    super(job, provider);
    this._markdownAdapter = new MarkdownAdapter(job, provider);
  }

  private _splitDeltas(deltas: DeltaInsert[]): DeltaInsert[][] {
    const result: DeltaInsert[][] = [[]];
    const pending: DeltaInsert[] = deltas;
    while (pending.length > 0) {
      const delta = pending.shift();
      if (!delta) {
        break;
      }
      if (delta.insert.includes('\n')) {
        const splitIndex = delta.insert.indexOf('\n');
        const line = delta.insert.slice(0, splitIndex);
        const rest = delta.insert.slice(splitIndex + 1);
        result[result.length - 1].push({ ...delta, insert: line });
        result.push([]);
        if (rest) {
          pending.unshift({ ...delta, insert: rest });
        }
      } else {
        result[result.length - 1].push(delta);
      }
    }
    return result;
  }

  private async _traverseSnapshot(
    snapshot: BlockSnapshot
  ): Promise<{ mixtext: string }> {
    let buffer = '';
    const walker = new ASTWalker<BlockSnapshot, never>();
    walker.setONodeTypeGuard(
      (node): node is BlockSnapshot =>
        BlockSnapshotSchema.safeParse(node).success
    );
    walker.setEnter(o => {
      const text = (o.node.props.text ?? { delta: [] }) as {
        delta: DeltaInsert[];
      };
      if (buffer.length > 0) {
        buffer += '\n';
      }
      switch (o.node.flavour) {
        case 'affine:code': {
          buffer += text.delta.map(delta => delta.insert).join('');
          break;
        }
        case 'affine:paragraph': {
          buffer += text.delta.map(delta => delta.insert).join('');
          break;
        }
        case 'affine:list': {
          buffer += text.delta.map(delta => delta.insert).join('');
          break;
        }
        case 'affine:divider': {
          buffer += '---';
          break;
        }
      }
    });
    await walker.walkONode(snapshot);
    return {
      mixtext: buffer,
    };
  }

  async fromBlockSnapshot({
    snapshot,
  }: FromBlockSnapshotPayload): Promise<FromBlockSnapshotResult<MixText>> {
    const { mixtext } = await this._traverseSnapshot(snapshot);
    return {
      file: mixtext,
      assetsIds: [],
    };
  }

  async fromDocSnapshot({
    snapshot,
    assets,
  }: FromDocSnapshotPayload): Promise<FromDocSnapshotResult<MixText>> {
    let buffer = '';
    if (snapshot.meta.title) {
      buffer += `${snapshot.meta.title}\n\n`;
    }
    const { file, assetsIds } = await this.fromBlockSnapshot({
      snapshot: snapshot.blocks,
      assets,
    });
    buffer += file;
    return {
      file: buffer,
      assetsIds,
    };
  }

  async fromSliceSnapshot({
    snapshot,
  }: FromSliceSnapshotPayload): Promise<FromSliceSnapshotResult<MixText>> {
    let buffer = '';
    const sliceAssetsIds: string[] = [];
    for (const contentSlice of snapshot.content) {
      const { mixtext } = await this._traverseSnapshot(contentSlice);
      buffer += mixtext;
    }
    const mixtext =
      buffer.match(/\n/g)?.length === 1 ? buffer.trimEnd() : buffer;
    return {
      file: mixtext,
      assetsIds: sliceAssetsIds,
    };
  }

  toBlockSnapshot(payload: ToBlockSnapshotPayload<MixText>): BlockSnapshot {
    payload.file = payload.file.replaceAll('\r', '');
    return {
      type: 'block',
      id: nanoid(),
      flavour: 'affine:note',
      props: {
        xywh: '[0,0,800,95]',
        background: DefaultTheme.noteBackgrounColor,
        index: 'a0',
        hidden: false,
        displayMode: NoteDisplayMode.DocAndEdgeless,
      },
      children: payload.file.split('\n').map((line): BlockSnapshot => {
        return {
          type: 'block',
          id: nanoid(),
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: line,
                },
              ],
            },
          },
          children: [],
        };
      }),
    };
  }

  toDocSnapshot(payload: ToDocSnapshotPayload<MixText>): DocSnapshot {
    payload.file = payload.file.replaceAll('\r', '');
    return {
      type: 'page',
      meta: {
        id: nanoid(),
        title: 'Untitled',
        createDate: Date.now(),
        tags: [],
      },
      blocks: {
        type: 'block',
        id: nanoid(),
        flavour: 'affine:page',
        props: {
          title: {
            '$blocksuite:internal:text$': true,
            delta: [
              {
                insert: 'Untitled',
              },
            ],
          },
        },
        children: [
          {
            type: 'block',
            id: nanoid(),
            flavour: 'affine:surface',
            props: {
              elements: {},
            },
            children: [],
          },
          {
            type: 'block',
            id: nanoid(),
            flavour: 'affine:note',
            props: {
              xywh: '[0,0,800,95]',
              background: DefaultTheme.noteBackgrounColor,
              index: 'a0',
              hidden: false,
              displayMode: NoteDisplayMode.DocAndEdgeless,
            },
            children: payload.file.split('\n').map((line): BlockSnapshot => {
              return {
                type: 'block',
                id: nanoid(),
                flavour: 'affine:paragraph',
                props: {
                  type: 'text',
                  text: {
                    '$blocksuite:internal:text$': true,
                    delta: [
                      {
                        insert: line,
                      },
                    ],
                  },
                },
                children: [],
              };
            }),
          },
        ],
      },
    };
  }

  async toSliceSnapshot(
    payload: MixTextToSliceSnapshotPayload
  ): Promise<SliceSnapshot | null> {
    if (payload.file.trim().length === 0) {
      return null;
    }
    payload.file = payload.file.replaceAll('\r', '');
    const sliceSnapshot = await this._markdownAdapter.toSliceSnapshot({
      file: payload.file,
      assets: payload.assets,
      workspaceId: payload.workspaceId,
      pageId: payload.pageId,
    });
    if (!sliceSnapshot) {
      return null;
    }
    for (const contentSlice of sliceSnapshot.content) {
      const blockSnapshotRoot = {
        type: 'block',
        id: nanoid(),
        flavour: 'affine:note',
        props: {
          xywh: '[0,0,800,95]',
          background: DefaultTheme.noteBackgrounColor,
          index: 'a0',
          hidden: false,
          displayMode: NoteDisplayMode.DocAndEdgeless,
        },
        children: [],
      } as BlockSnapshot;
      const walker = new ASTWalker<BlockSnapshot, BlockSnapshot>();
      walker.setONodeTypeGuard(
        (node): node is BlockSnapshot =>
          BlockSnapshotSchema.safeParse(node).success
      );
      walker.setEnter((o, context) => {
        switch (o.node.flavour) {
          case 'affine:note': {
            break;
          }
          case 'affine:paragraph': {
            if (o.parent?.node.flavour !== 'affine:note') {
              context.openNode({ ...o.node, children: [] });
              break;
            }
            const text = (o.node.props.text ?? { delta: [] }) as {
              delta: DeltaInsert[];
            };
            const newDeltas = this._splitDeltas(text.delta);
            for (const [i, delta] of newDeltas.entries()) {
              context.openNode({
                ...o.node,
                id: i === 0 ? o.node.id : nanoid(),
                props: {
                  ...o.node.props,
                  text: {
                    '$blocksuite:internal:text$': true,
                    delta,
                  },
                },
                children: [],
              });
              if (i < newDeltas.length - 1) {
                context.closeNode();
              }
            }
            break;
          }
          default: {
            context.openNode({ ...o.node, children: [] });
          }
        }
      });
      walker.setLeave((o, context) => {
        switch (o.node.flavour) {
          case 'affine:note': {
            break;
          }
          default: {
            context.closeNode();
          }
        }
      });
      await walker.walk(contentSlice, blockSnapshotRoot);
      contentSlice.children = blockSnapshotRoot.children;
    }
    return sliceSnapshot;
  }
}

export const MixTextAdapterFactoryIdentifier =
  AdapterFactoryIdentifier('MixText');

export const MixTextAdapterFactoryExtension: ExtensionType = {
  setup: di => {
    di.addImpl(MixTextAdapterFactoryIdentifier, provider => ({
      get: (job: Transformer) => new MixTextAdapter(job, provider),
    }));
  },
};
