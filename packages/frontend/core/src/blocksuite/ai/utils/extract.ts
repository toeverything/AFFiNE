import type { ServiceProvider } from '@blocksuite/affine/global/di';
import {
  DatabaseBlockModel,
  ImageBlockModel,
  type NoteBlockModel,
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
  isInsideEdgelessEditor,
  matchModels,
} from '@blocksuite/affine/shared/utils';
import type { EditorHost } from '@blocksuite/affine/std';
import type { BlockModel, Store } from '@blocksuite/affine/store';
import { Slice, toDraftModel } from '@blocksuite/affine/store';

import type { ChatContextValue } from '../chat-panel/chat-context';
import {
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

  const canvas = await selectedToCanvas(host);
  if (!canvas) return null;

  const blob: Blob | null = await new Promise(resolve =>
    canvas.toBlob(resolve)
  );
  if (!blob) return null;

  return {
    images: [new File([blob], 'selected.png')],
  };
}

async function extractPageSelected(
  host: EditorHost
): Promise<Partial<ChatContextValue> | null> {
  const text = await getSelectedTextContent(host, 'plain-text');
  const images = await getSelectedImagesAsBlobs(host);
  const hasText = text.length > 0;
  const hasImages = images.length > 0;

  if (hasText && !hasImages) {
    const markdown = await getSelectedTextContent(host, 'markdown');
    return {
      quote: text,
      markdown: markdown,
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
      images,
    };
  } else {
    const markdown =
      (await getSelectedTextContent(host, 'markdown')).trim() || '';
    return {
      quote: text,
      markdown,
      images,
    };
  }
}

export async function extractMarkdownFromDoc(
  doc: Store,
  provider: ServiceProvider
): Promise<string> {
  const transformer = await getTransformer(doc);
  const adapter = new MarkdownAdapter(transformer, provider);
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
