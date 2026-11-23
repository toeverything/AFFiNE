import { DefaultTheme, NoteDisplayMode } from '@blocksuite/affine-model';
import type { ServiceProvider } from '@blocksuite/global/di';
import {
  type AssetsManager,
  ASTWalker,
  BaseAdapter,
  type BlockSnapshot,
  BlockSnapshotSchema,
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

import {
  type AdapterContext,
  AdapterFactoryIdentifier,
  type TextBuffer,
} from '../types';
import {
  type BlockPlainTextAdapterMatcher,
  BlockPlainTextAdapterMatcherIdentifier,
} from './block-adapter';
import {
  InlineDeltaToPlainTextAdapterMatcherIdentifier,
  PlainTextDeltaConverter,
} from './delta-converter';

export type PlainText = string;

type PlainTextToSliceSnapshotPayload = {
  file: PlainText;
  assets?: AssetsManager;
  workspaceId: string;
  pageId: string;
};

export class PlainTextAdapter extends BaseAdapter<PlainText> {
  deltaConverter: PlainTextDeltaConverter;

  readonly blockMatchers: BlockPlainTextAdapterMatcher[];

  constructor(job: Transformer, provider: ServiceProvider) {
    super(job, provider);
    const blockMatchers = Array.from(
      provider.getAll(BlockPlainTextAdapterMatcherIdentifier).values()
    );
    const inlineDeltaToPlainTextAdapterMatchers = Array.from(
      provider.getAll(InlineDeltaToPlainTextAdapterMatcherIdentifier).values()
    );
    this.blockMatchers = blockMatchers;
    this.deltaConverter = new PlainTextDeltaConverter(
      job.adapterConfigs,
      inlineDeltaToPlainTextAdapterMatchers,
      []
    );
  }

  private async _traverseSnapshot(
    snapshot: BlockSnapshot
  ): Promise<{ plaintext: string }> {
    const textBuffer: TextBuffer = {
      content: '',
    };
    const walker = new ASTWalker<BlockSnapshot, TextBuffer>();
    walker.setONodeTypeGuard(
      (node): node is BlockSnapshot =>
        BlockSnapshotSchema.safeParse(node).success
    );
    walker.setEnter(async (o, context) => {
      for (const matcher of this.blockMatchers) {
        if (matcher.fromMatch(o)) {
          const adapterContext: AdapterContext<BlockSnapshot, TextBuffer> = {
            walker,
            walkerContext: context,
            configs: this.configs,
            job: this.job,
            deltaConverter: this.deltaConverter,
            provider: this.provider,
            textBuffer,
          };
          await matcher.fromBlockSnapshot.enter?.(o, adapterContext);
        }
      }
    });
    walker.setLeave(async (o, context) => {
      for (const matcher of this.blockMatchers) {
        if (matcher.fromMatch(o)) {
          const adapterContext: AdapterContext<BlockSnapshot, TextBuffer> = {
            walker,
            walkerContext: context,
            configs: this.configs,
            job: this.job,
            deltaConverter: this.deltaConverter,
            provider: this.provider,
            textBuffer,
          };
          await matcher.fromBlockSnapshot.leave?.(o, adapterContext);
        }
      }
    });
    await walker.walkONode(snapshot);
    return {
      plaintext: textBuffer.content,
    };
  }

  async fromBlockSnapshot({
    snapshot,
  }: FromBlockSnapshotPayload): Promise<FromBlockSnapshotResult<PlainText>> {
    const { plaintext } = await this._traverseSnapshot(snapshot);
    return {
      file: plaintext,
      assetsIds: [],
    };
  }

  async fromDocSnapshot({
    snapshot,
    assets,
  }: FromDocSnapshotPayload): Promise<FromDocSnapshotResult<PlainText>> {
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
  }: FromSliceSnapshotPayload): Promise<FromSliceSnapshotResult<PlainText>> {
    let buffer = '';
    const sliceAssetsIds: string[] = [];
    for (const contentSlice of snapshot.content) {
      const { plaintext } = await this._traverseSnapshot(contentSlice);
      buffer += plaintext;
    }
    const plaintext =
      buffer.match(/\n/g)?.length === 1 ? buffer.trimEnd() : buffer;
    return {
      file: plaintext,
      assetsIds: sliceAssetsIds,
    };
  }

  toBlockSnapshot(payload: ToBlockSnapshotPayload<PlainText>): BlockSnapshot {
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

  toDocSnapshot(payload: ToDocSnapshotPayload<PlainText>): DocSnapshot {
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

  toSliceSnapshot(
    payload: PlainTextToSliceSnapshotPayload
  ): SliceSnapshot | null {
    if (payload.file.trim().length === 0) {
      return null;
    }
    payload.file = payload.file.replaceAll('\r', '');
    const contentSlice = {
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
    } as BlockSnapshot;
    return {
      type: 'slice',
      content: [contentSlice],
      workspaceId: payload.workspaceId,
      pageId: payload.pageId,
    };
  }
}

export const PlainTextAdapterFactoryIdentifier =
  AdapterFactoryIdentifier('PlainText');

export const PlainTextAdapterFactoryExtension: ExtensionType = {
  setup: di => {
    di.addImpl(PlainTextAdapterFactoryIdentifier, provider => ({
      get: (job: Transformer) => new PlainTextAdapter(job, provider),
    }));
  },
};
