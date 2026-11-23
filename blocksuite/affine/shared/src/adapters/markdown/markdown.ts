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
import type { Root } from 'mdast';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';

import {
  HtmlASTToDeltaMatcherIdentifier,
  HtmlDeltaConverter,
  InlineDeltaToHtmlAdapterMatcherIdentifier,
} from '../html/delta-converter.js';
import { type AdapterContext, AdapterFactoryIdentifier } from '../types';
import {
  type BlockMarkdownAdapterMatcher,
  BlockMarkdownAdapterMatcherIdentifier,
} from './block-adapter';
import {
  InlineDeltaToMarkdownAdapterMatcherIdentifier,
  MarkdownASTToDeltaMatcherIdentifier,
  MarkdownDeltaConverter,
} from './delta-converter';
import { remarkGfm } from './gfm';
import { MarkdownPreprocessorManager } from './preprocessor';
import { remarkCallout } from './remark-plugins/remark-callout';
import type { Markdown, MarkdownAST } from './type';

type MarkdownToSliceSnapshotPayload = {
  file: Markdown;
  assets?: AssetsManager;
  workspaceId: string;
  pageId: string;
};

export class MarkdownAdapter extends BaseAdapter<Markdown> {
  private readonly _traverseMarkdown = (
    markdown: MarkdownAST,
    snapshot: BlockSnapshot,
    assets?: AssetsManager
  ) => {
    const walker = new ASTWalker<MarkdownAST, BlockSnapshot>();
    walker.setONodeTypeGuard(
      (node): node is MarkdownAST =>
        !Array.isArray(node) &&
        'type' in (node as object) &&
        (node as MarkdownAST).type !== undefined
    );
    walker.setEnter(async (o, context) => {
      for (const matcher of this.blockMatchers) {
        if (matcher.toMatch(o)) {
          const adapterContext: AdapterContext<
            MarkdownAST,
            BlockSnapshot,
            MarkdownDeltaConverter
          > = {
            walker,
            walkerContext: context,
            configs: this.configs,
            job: this.job,
            deltaConverter: this.deltaConverter,
            provider: this.provider,
            textBuffer: { content: '' },
            assets,
          };
          await matcher.toBlockSnapshot.enter?.(o, adapterContext);
        }
      }
    });
    walker.setLeave(async (o, context) => {
      for (const matcher of this.blockMatchers) {
        if (matcher.toMatch(o)) {
          const adapterContext: AdapterContext<
            MarkdownAST,
            BlockSnapshot,
            MarkdownDeltaConverter
          > = {
            walker,
            walkerContext: context,
            configs: this.configs,
            job: this.job,
            deltaConverter: this.deltaConverter,
            provider: this.provider,
            textBuffer: { content: '' },
            assets,
          };
          await matcher.toBlockSnapshot.leave?.(o, adapterContext);
        }
      }
    });
    return walker.walk(markdown, snapshot);
  };

  private readonly _traverseSnapshot = async (
    snapshot: BlockSnapshot,
    markdown: MarkdownAST,
    assets?: AssetsManager
  ) => {
    const assetsIds: string[] = [];
    const walker = new ASTWalker<BlockSnapshot, MarkdownAST>();
    walker.setONodeTypeGuard(
      (node): node is BlockSnapshot =>
        BlockSnapshotSchema.safeParse(node).success
    );
    walker.setEnter(async (o, context) => {
      for (const matcher of this.blockMatchers) {
        if (matcher.fromMatch(o)) {
          const adapterContext: AdapterContext<
            BlockSnapshot,
            MarkdownAST,
            MarkdownDeltaConverter
          > = {
            walker,
            walkerContext: context,
            configs: this.configs,
            job: this.job,
            deltaConverter: this.deltaConverter,
            provider: this.provider,
            textBuffer: { content: '' },
            assets,
            updateAssetIds: (assetsId: string) => {
              assetsIds.push(assetsId);
            },
          };
          await matcher.fromBlockSnapshot.enter?.(o, adapterContext);
        }
      }
    });
    walker.setLeave(async (o, context) => {
      for (const matcher of this.blockMatchers) {
        if (matcher.fromMatch(o)) {
          const adapterContext: AdapterContext<
            BlockSnapshot,
            MarkdownAST,
            MarkdownDeltaConverter
          > = {
            walker,
            walkerContext: context,
            configs: this.configs,
            job: this.job,
            deltaConverter: this.deltaConverter,
            provider: this.provider,
            textBuffer: { content: '' },
            assets,
          };
          await matcher.fromBlockSnapshot.leave?.(o, adapterContext);
        }
      }
    });
    return {
      ast: (await walker.walk(snapshot, markdown)) as Root,
      assetsIds,
    };
  };

  deltaConverter: MarkdownDeltaConverter;
  preprocessorManager: MarkdownPreprocessorManager;

  readonly blockMatchers: BlockMarkdownAdapterMatcher[];

  constructor(job: Transformer, provider: ServiceProvider) {
    super(job, provider);
    const blockMatchers = Array.from(
      provider.getAll(BlockMarkdownAdapterMatcherIdentifier).values()
    );
    const inlineDeltaToMarkdownAdapterMatchers = Array.from(
      provider.getAll(InlineDeltaToMarkdownAdapterMatcherIdentifier).values()
    );
    const markdownInlineToDeltaMatchers = Array.from(
      provider.getAll(MarkdownASTToDeltaMatcherIdentifier).values()
    );
    const inlineDeltaToHtmlAdapterMatchers = Array.from(
      provider.getAll(InlineDeltaToHtmlAdapterMatcherIdentifier).values()
    );
    const htmlInlineToDeltaMatchers = Array.from(
      provider.getAll(HtmlASTToDeltaMatcherIdentifier).values()
    );
    const htmlDeltaConverter = new HtmlDeltaConverter(
      job.adapterConfigs,
      inlineDeltaToHtmlAdapterMatchers,
      htmlInlineToDeltaMatchers,
      provider
    );
    this.blockMatchers = blockMatchers;
    this.deltaConverter = new MarkdownDeltaConverter(
      job.adapterConfigs,
      inlineDeltaToMarkdownAdapterMatchers,
      markdownInlineToDeltaMatchers,
      htmlDeltaConverter
    );
    this.preprocessorManager = new MarkdownPreprocessorManager(provider);
  }

  private _astToMarkdown(ast: Root) {
    return unified()
      .use(remarkGfm)
      .use(remarkStringify, {
        resourceLink: true,
      })
      .use(remarkMath)
      .stringify(ast)
      .replace(/&#x20;\n/g, ' \n');
  }

  private _markdownToAst(markdown: Markdown) {
    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath)
      .use(remarkCallout);
    const ast = processor.parse(markdown);
    return processor.runSync(ast);
  }

  async fromBlockSnapshot({
    snapshot,
    assets,
  }: FromBlockSnapshotPayload): Promise<FromBlockSnapshotResult<Markdown>> {
    const root: Root = {
      type: 'root',
      children: [],
    };
    const { ast, assetsIds } = await this._traverseSnapshot(
      snapshot,
      root,
      assets
    );
    return {
      file: this._astToMarkdown(ast),
      assetsIds,
    };
  }

  async fromDocSnapshot({
    snapshot,
    assets,
  }: FromDocSnapshotPayload): Promise<FromDocSnapshotResult<Markdown>> {
    let buffer = '';
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
    assets,
  }: FromSliceSnapshotPayload): Promise<FromSliceSnapshotResult<Markdown>> {
    let buffer = '';
    const sliceAssetsIds: string[] = [];
    for (const contentSlice of snapshot.content) {
      const root: Root = {
        type: 'root',
        children: [],
      };
      const { ast, assetsIds } = await this._traverseSnapshot(
        contentSlice,
        root,
        assets
      );
      sliceAssetsIds.push(...assetsIds);
      buffer += this._astToMarkdown(ast);
    }
    const markdown =
      buffer.match(/\n/g)?.length === 1 ? buffer.trimEnd() : buffer;
    return {
      file: markdown,
      assetsIds: sliceAssetsIds,
    };
  }

  async toBlockSnapshot(
    payload: ToBlockSnapshotPayload<Markdown>
  ): Promise<BlockSnapshot> {
    const markdownFile = this.preprocessorManager.process(
      'block',
      payload.file
    );
    const markdownAst = this._markdownToAst(markdownFile);
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
    };
    return this._traverseMarkdown(
      markdownAst,
      blockSnapshotRoot as BlockSnapshot,
      payload.assets
    );
  }

  async toDocSnapshot(
    payload: ToDocSnapshotPayload<Markdown>
  ): Promise<DocSnapshot> {
    const markdownFile = this.preprocessorManager.process('doc', payload.file);
    const markdownAst = this._markdownToAst(markdownFile);
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
    };
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
          await this._traverseMarkdown(
            markdownAst,
            blockSnapshotRoot as BlockSnapshot,
            payload.assets
          ),
        ],
      },
    };
  }

  async toSliceSnapshot(
    payload: MarkdownToSliceSnapshotPayload
  ): Promise<SliceSnapshot | null> {
    const markdownFile = this.preprocessorManager.process(
      'slice',
      payload.file
    );
    const markdownAst = this._markdownToAst(markdownFile);
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
    const contentSlice = (await this._traverseMarkdown(
      markdownAst,
      blockSnapshotRoot,
      payload.assets
    )) as BlockSnapshot;
    if (contentSlice.children.length === 0) {
      return null;
    }
    return {
      type: 'slice',
      content: [contentSlice],
      workspaceId: payload.workspaceId,
      pageId: payload.pageId,
    };
  }
}

export const MarkdownAdapterFactoryIdentifier =
  AdapterFactoryIdentifier('Markdown');

export const MarkdownAdapterFactoryExtension: ExtensionType = {
  setup: di => {
    di.addImpl(MarkdownAdapterFactoryIdentifier, provider => ({
      get: (job: Transformer) => new MarkdownAdapter(job, provider),
    }));
  },
};
