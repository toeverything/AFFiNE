import type { FeatureFlagService } from '@affine/core/modules/feature-flag';
import { WorkspaceImpl } from '@affine/core/modules/workspace/impls/workspace';
import {
  defaultImageProxyMiddleware,
  embedSyncedDocMiddleware,
  MarkdownAdapter,
  pasteMiddleware,
  PlainTextAdapter,
  titleMiddleware,
} from '@blocksuite/affine/shared/adapters';
import {
  BlockStdScope,
  type EditorHost,
  type TextRangePoint,
  TextSelection,
} from '@blocksuite/affine/std';
import type {
  BlockModel,
  BlockSnapshot,
  DraftModel,
  Slice,
  SliceSnapshot,
  Store,
  TransformerMiddleware,
} from '@blocksuite/affine/store';
import { toDraftModel, Transformer } from '@blocksuite/affine/store';
import { Doc as YDoc } from 'yjs';

import { getStoreManager } from '../manager/store';

interface MarkdownWorkspace {
  collection: WorkspaceImpl;
  std: BlockStdScope;
}

let markdownWorkspace: MarkdownWorkspace | null = null;

const getMarkdownWorkspace = (
  featureFlagService?: FeatureFlagService
): MarkdownWorkspace => {
  if (markdownWorkspace) {
    return markdownWorkspace;
  }

  const collection = new WorkspaceImpl({
    rootDoc: new YDoc({ guid: 'markdownToDoc' }),
    featureFlagService: featureFlagService,
  });
  collection.meta.initialize();

  const mockDoc = collection.createDoc('mock-id');
  const std = new BlockStdScope({
    store: mockDoc.getStore(),
    extensions: getStoreManager().config.init().value.get('store'),
  });

  markdownWorkspace = {
    collection,
    std,
  };

  return markdownWorkspace;
};

const updateSnapshotText = (
  point: TextRangePoint,
  snapshot: BlockSnapshot,
  model: DraftModel
) => {
  const { index, length } = point;
  if (!snapshot.props.text || length === 0) {
    return;
  }
  (snapshot.props.text as Record<string, unknown>).delta =
    model.text?.sliceToDelta(index, length + index);
};

function processSnapshot(
  snapshot: BlockSnapshot,
  text: TextSelection,
  host: EditorHost
) {
  const model = host.store.getModelById(snapshot.id);
  if (!model) {
    return;
  }

  const modelId = model.id;
  if (text.from.blockId === modelId) {
    updateSnapshotText(text.from, snapshot, toDraftModel(model));
  }
  if (text.to && text.to.blockId === modelId) {
    updateSnapshotText(text.to, snapshot, toDraftModel(model));
  }

  // If the snapshot has children, handle them recursively
  snapshot.children.forEach(childSnapshot =>
    processSnapshot(childSnapshot, text, host)
  );
}

/**
 * Processes the text in the given snapshot if there is a text selection.
 * Only the selected portion of the snapshot will be processed.
 */
function processTextInSnapshot(snapshot: SliceSnapshot, host: EditorHost) {
  const { content } = snapshot;
  const text = host.selection.find(TextSelection);
  if (!content.length || !text) return;

  content.forEach(snapshot => processSnapshot(snapshot, text, host));
}

export async function getContentFromSlice(
  host: EditorHost,
  slice: Slice,
  type: 'markdown' | 'plain-text' = 'markdown'
) {
  const transformer = host.std.store.getTransformer([
    titleMiddleware(host.std.store.workspace.meta.docMetas),
    embedSyncedDocMiddleware('content'),
  ]);
  const snapshot = transformer.sliceToSnapshot(slice);
  if (!snapshot) {
    return '';
  }
  processTextInSnapshot(snapshot, host);
  const adapter =
    type === 'markdown'
      ? new MarkdownAdapter(transformer, host.std.store.provider)
      : new PlainTextAdapter(transformer, host.std.store.provider);
  const content = await adapter.fromSliceSnapshot({
    snapshot,
    assets: transformer.assetsManager,
  });
  return content.file;
}

export const markdownToSnapshot = async (
  markdown: string,
  store: Store,
  host?: EditorHost
) => {
  const middlewares = host
    ? [defaultImageProxyMiddleware, pasteMiddleware(host.std)]
    : [defaultImageProxyMiddleware];
  const transformer = store.getTransformer(middlewares);
  const markdownAdapter = new MarkdownAdapter(transformer, store.provider);
  const payload = {
    file: markdown,
    assets: transformer.assetsManager,
    workspaceId: store.workspace.id,
    pageId: store.id,
  };

  const page = await markdownAdapter.toDoc(payload);

  if (page) {
    const pageSnapshot = transformer.docToSnapshot(page);
    if (pageSnapshot) {
      const snapshot: SliceSnapshot = {
        type: 'slice',
        content: [
          pageSnapshot.blocks.children.find(
            b => b.flavour === 'affine:note'
          ) as BlockSnapshot,
        ],
        workspaceId: payload.workspaceId,
        pageId: payload.pageId,
      };

      return {
        snapshot,
        transformer,
      };
    }
  }

  return {
    snapshot: null,
    transformer,
  };
};

export async function insertFromMarkdown(
  host: EditorHost | undefined,
  markdown: string,
  doc: Store,
  parent?: string,
  index?: number,
  id?: string
) {
  const { snapshot, transformer } = await markdownToSnapshot(
    markdown,
    doc,
    host
  );

  const snapshots = snapshot?.content.flatMap(x => x.children) ?? [];

  const models: BlockModel[] = [];
  for (let i = 0; i < snapshots.length; i++) {
    const blockSnapshot = snapshots[i];
    if (snapshots.length === 1 && id) {
      blockSnapshot.id = id;
    }
    const model = await transformer.snapshotToBlock(
      blockSnapshot,
      doc,
      parent,
      (index ?? 0) + i
    );
    if (model) {
      models.push(model);
    }
  }

  return models;
}

export async function replaceFromMarkdown(
  host: EditorHost | undefined,
  markdown: string,
  doc: Store,
  parent: string,
  index: number,
  id: string
) {
  doc.deleteBlock(id);
  const { snapshot, transformer } = await markdownToSnapshot(
    markdown,
    doc,
    host
  );

  const snapshots = snapshot?.content.flatMap(x => x.children) ?? [];
  const blockSnapshot = snapshots[0];
  blockSnapshot.id = id;
  await transformer.snapshotToBlock(blockSnapshot, doc, parent, index);
}

export async function markDownToDoc(
  answer: string,
  middlewares?: TransformerMiddleware[],
  affineFeatureFlagService?: FeatureFlagService
) {
  const { collection, std } = getMarkdownWorkspace(affineFeatureFlagService);

  const transformer = new Transformer({
    schema: std.store.schema,
    blobCRUD: collection.blobSync,
    docCRUD: {
      create: (id: string) => collection.createDoc(id).getStore({ id }),
      get: (id: string) => collection.getDoc(id)?.getStore({ id }) ?? null,
      delete: (id: string) => collection.removeDoc(id),
    },
    middlewares,
  });
  const mdAdapter = new MarkdownAdapter(transformer, std.store.provider);
  const doc = await mdAdapter.toDoc({
    file: answer,
    assets: transformer.assetsManager,
  });
  if (!doc) {
    console.error('Failed to convert markdown to doc');
  }
  return doc as Store;
}
