import { WorkspaceImpl } from '@affine/core/modules/workspace/impls/workspace';
import { getSurfaceBlock } from '@blocksuite/affine/blocks/surface';
import {
  DatabaseBlockModel,
  EmbedLinkedDocModel,
  EmbedSyncedDocModel,
  ImageBlockModel,
  NoteBlockModel,
  NoteDisplayMode,
} from '@blocksuite/affine/model';
import {
  embedSyncedDocMiddleware,
  MarkdownAdapter,
  titleMiddleware,
} from '@blocksuite/affine/shared/adapters';
import {
  getImageSelectionsCommand,
  getSelectedBlocksCommand,
} from '@blocksuite/affine/shared/commands';
import { DocModeProvider } from '@blocksuite/affine/shared/services';
import {
  getBlockProps,
  isInsideEdgelessEditor,
  matchModels,
} from '@blocksuite/affine/shared/utils';
import { BlockStdScope, type EditorHost } from '@blocksuite/affine/std';
import {
  GfxControllerIdentifier,
  GfxPrimitiveElementModel,
} from '@blocksuite/affine/std/gfx';
import type { BlockModel, DocSnapshot, Store } from '@blocksuite/affine/store';
import { Slice, toDraftModel } from '@blocksuite/affine/store';
import { getElementProps } from '@blocksuite/affine-block-root';
import { Doc as YDoc } from 'yjs';

import { getStoreManager } from '../../manager/store';
import type { ChatContextValue } from '../components/ai-chat-content';
import { isAttachment } from './attachment';
import { isImage } from './image';
import {
  getSelectedAttachments,
  getSelectedImagesAsBlobs,
  getSelectedTextContent,
  selectedToCanvas,
} from './selection-utils';

export async function extractSelectedContent(
  host: EditorHost
): Promise<Partial<ChatContextValue> | null> {
  const docModeService = host.std.get(DocModeProvider);
  const mode = docModeService.getEditorMode() || 'page';
  if (mode === 'edgeless') {
    return await extractEdgelessSelected(host);
  } else {
    return await extractPageSelected(host);
  }
}

async function extractEdgelessSelected(
  host: EditorHost
): Promise<Partial<ChatContextValue> | null> {
  if (!isInsideEdgelessEditor(host)) return null;
  const gfx = host.std.get(GfxControllerIdentifier);
  const selectedElements = gfx.selection.selectedElements;

  let snapshot: DocSnapshot | null = null;
  let markdown = '';
  const attachments: ChatContextValue['attachments'] = [];
  const images: File[] = [];
  const docs: ChatContextValue['docs'] = [];

  if (selectedElements.length) {
    const transformer = host.store.getTransformer();
    const markdownAdapter = new MarkdownAdapter(
      transformer,
      host.store.provider
    );
    const collection = new WorkspaceImpl({
      id: 'AI_EXTRACT',
      rootDoc: new YDoc({ guid: 'AI_EXTRACT' }),
    });
    collection.meta.initialize();

    let needSnapshot = false;
    let needMarkdown = false;
    try {
      const fragmentDoc = collection.createDoc();
      const fragment = fragmentDoc.getStore();
      fragmentDoc.load();

      const rootId = fragment.addBlock('affine:page');
      fragment.addBlock('affine:surface', {}, rootId);
      const noteId = fragment.addBlock('affine:note', {}, rootId);
      const surface = getSurfaceBlock(fragment);
      if (!surface) {
        throw new Error('Failed to get surface block');
      }

      for (const element of selectedElements) {
        if (element instanceof NoteBlockModel) {
          needMarkdown = true;
          for (const child of element.children) {
            const props = getBlockProps(child);
            fragment.addBlock(child.flavour, props, noteId);
          }
        } else if (isAttachment(element)) {
          const { name, sourceId } = element.props;
          if (name && sourceId) {
            attachments.push({ name, sourceId });
          }
        } else if (isImage(element)) {
          const { sourceId } = element.props;
          if (sourceId) {
            const blob = await host.store.blobSync.get(sourceId);
            if (blob) {
              images.push(new File([blob], sourceId));
            }
          }
        } else if (element instanceof GfxPrimitiveElementModel) {
          needSnapshot = true;
          const props = getElementProps(element, new Map());
          surface.addElement(props);
        } else if (
          element instanceof EmbedSyncedDocModel ||
          element instanceof EmbedLinkedDocModel
        ) {
          const docId = element.props.pageId;
          docs.push(docId);
        }
      }

      if (needSnapshot) {
        snapshot = transformer.docToSnapshot(fragment) ?? null;
      }
      if (needMarkdown) {
        markdown = (await markdownAdapter.fromDoc(fragment))?.file ?? '';
      }
    } finally {
      collection.dispose();
    }
  }

  const canvas = await selectedToCanvas(host);
  if (!canvas) return null;

  const blob: Blob | null = await new Promise(resolve =>
    canvas.toBlob(resolve)
  );
  if (!blob) return null;

  return {
    images: [new File([blob], 'selected.png'), ...images],
    snapshot: snapshot ? JSON.stringify(snapshot) : null,
    combinedElementsMarkdown: markdown.length ? markdown : null,
    attachments,
    docs,
  };
}

async function extractPageSelected(
  host: EditorHost
): Promise<Partial<ChatContextValue> | null> {
  const text = await getSelectedTextContent(host, 'plain-text');
  const images = await getSelectedImagesAsBlobs(host);
  const attachments = await getSelectedAttachments(host);
  const hasText = text.length > 0;
  const hasImages = images.length > 0;

  if (hasText && !hasImages) {
    const markdown = await getSelectedTextContent(host, 'markdown');
    return {
      quote: text,
      markdown: markdown,
      attachments,
    };
  } else if (!hasText && hasImages && images.length === 1) {
    host.command
      .chain()
      .tryAll(chain => [chain.pipe(getImageSelectionsCommand)])
      .pipe(getSelectedBlocksCommand, {
        types: ['image'],
      })
      .run();
    return {
      attachments,
      images,
    };
  } else {
    const markdown =
      (await getSelectedTextContent(host, 'markdown')).trim() || '';
    return {
      quote: text,
      markdown,
      images,
      attachments,
    };
  }
}

export async function extractMarkdownFromDoc(doc: Store): Promise<string> {
  const std = new BlockStdScope({
    store: doc,
    extensions: getStoreManager().config.init().value.get('store'),
  });
  const transformer = await getTransformer(doc);
  const adapter = new MarkdownAdapter(transformer, std.provider);
  const blockModels = getNoteBlockModels(doc);
  const textModels = blockModels.filter(
    model => !matchModels(model, [ImageBlockModel, DatabaseBlockModel])
  );
  const drafts = textModels.map(toDraftModel);
  const slice = Slice.fromModels(doc, drafts);

  const snapshot = transformer.sliceToSnapshot(slice);
  if (!snapshot) {
    throw new Error('Failed to extract markdown, snapshot is undefined');
  }
  const content = await adapter.fromSliceSnapshot({
    snapshot,
    assets: transformer.assetsManager,
  });
  return content.file;
}

function getNoteBlockModels(doc: Store) {
  const notes = doc
    .getBlocksByFlavour('affine:note')
    .filter(
      note =>
        (note.model as NoteBlockModel).props.displayMode !==
        NoteDisplayMode.EdgelessOnly
    )
    .map(note => note.model as NoteBlockModel);
  const blockModels = notes.reduce((acc, note) => {
    acc.push(...note.children);
    return acc;
  }, [] as BlockModel[]);
  return blockModels;
}

async function getTransformer(doc: Store) {
  return doc.getTransformer([
    titleMiddleware(doc.workspace.meta.docMetas),
    embedSyncedDocMiddleware('content'),
  ]);
}
