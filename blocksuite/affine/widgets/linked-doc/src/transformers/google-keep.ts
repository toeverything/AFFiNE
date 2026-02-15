import type {
  BlockModel,
  DocMeta,
  ExtensionType,
  Schema,
  Store,
  Workspace,
} from '@blocksuite/store';

import { HtmlTransformer } from './html.js';
import { Unzip } from './utils.js';

type ImportGoogleKeepZipOptions = {
  collection: Workspace;
  schema: Schema;
  imported: Blob;
  extensions: ExtensionType[];
  onFavoriteImported?: (docId: string) => void | Promise<void>;
  onResolveTags?: (tagNames: string[]) => string[] | Promise<string[]>;
  onProgress?: (stats: { totalDocs: number; importedDocs: number }) => void;
};

type GoogleKeepListItem = {
  text?: string;
  isChecked?: boolean;
  checked?: boolean;
};

type GoogleKeepNote = {
  title?: string;
  textContent?: string;
  listContent?: GoogleKeepListItem[];
  attachments?: Array<{
    filePath?: string;
    mimetype?: string;
  }>;
  labels?: Array<{ name?: string }>;
  createdTimestampUsec?: number | string;
  userEditedTimestampUsec?: number | string;
  isPinned?: boolean;
  isArchived?: boolean;
  isTrashed?: boolean;
  color?: string;
};

type GoogleKeepMeta = Partial<
  Pick<DocMeta, 'title' | 'createDate' | 'updatedDate' | 'favorite'>
>;

type ResolvedKeepAttachment = {
  blob: Blob;
  fileName: string;
  mimeType: string;
  isImage: boolean;
};

const KEEP_ATTACHMENTS_COLUMNS = 3;
const KEEP_ATTACHMENTS_COLUMN_WIDTH = 260;
const KEEP_ATTACHMENTS_GAP = 24;
const KEEP_ATTACHMENTS_MAX_HEIGHT = 360;
const KEEP_ATTACHMENTS_MIN_DIMENSION = 48;
const KEEP_ATTACHMENTS_FRAME_PADDING = 20;
const KEEP_ATTACHMENTS_PAGE_GAP = 180;

function toTimestampFromUsec(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const num = Number(value);
  if (!Number.isFinite(num)) return undefined;
  return Math.round(num / 1000);
}

function toMeta(note: GoogleKeepNote, fallbackTitle: string): GoogleKeepMeta {
  const title = (note.title || '').trim() || fallbackTitle;
  const meta: GoogleKeepMeta = { title };

  const created = toTimestampFromUsec(note.createdTimestampUsec);
  if (created !== undefined) {
    meta.createDate = created;
  }
  const updated = toTimestampFromUsec(note.userEditedTimestampUsec);
  if (updated !== undefined) {
    meta.updatedDate = updated;
  }

  if (note.isPinned) {
    meta.favorite = true;
  }

  return meta;
}

function extractTagNames(note: GoogleKeepNote): string[] {
  return [
    ...new Set(
      (note.labels ?? [])
        .map(label => label.name?.trim())
        .filter((name): name is string => Boolean(name))
    ),
  ];
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function looksLikeHtml(text: string): boolean {
  return /<[^>]+>/.test(text);
}

function renderTextContent(text: string): string {
  if (looksLikeHtml(text)) {
    return text;
  }
  return `<p>${escapeHtml(text).replaceAll('\n', '<br/>')}</p>`;
}

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\.?\//, '');
}

function dirname(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf('/');
  return index === -1 ? '' : normalized.slice(0, index);
}

function resolveAttachmentBlob(
  notePath: string,
  filePath: string,
  files: Map<string, Blob>
): Blob | undefined {
  const normalizedFilePath = normalizePath(filePath);
  const baseDir = dirname(notePath);
  const candidates = [
    normalizedFilePath,
    baseDir ? `${baseDir}/${normalizedFilePath}` : normalizedFilePath,
  ];
  for (const path of candidates) {
    const blob = files.get(path);
    if (blob) {
      return blob;
    }
  }
  return undefined;
}

function toFileName(path: string): string {
  const normalized = normalizePath(path);
  return normalized.split('/').pop() || 'attachment';
}

function getFirstModelByFlavour(
  store: Store,
  flavour: string
): BlockModel | null {
  const block = store.getBlocksByFlavour(flavour)[0];
  return block?.model ?? null;
}

function ensureSurfaceModel(store: Store): BlockModel | null {
  const existing = getFirstModelByFlavour(store, 'affine:surface');
  if (existing) {
    return existing;
  }

  const rootId = store.root?.id;
  if (!rootId) {
    return null;
  }

  const surfaceId = store.addBlock('affine:surface', {}, rootId);
  return store.getModelById(surfaceId) as BlockModel | null;
}

function parseXywh(xywh: unknown): [number, number, number, number] | null {
  if (typeof xywh !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(xywh) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.length === 4 &&
      parsed.every(value => typeof value === 'number' && Number.isFinite(value))
    ) {
      return parsed as [number, number, number, number];
    }
  } catch {
    return null;
  }

  return null;
}

function getAttachmentsAnchorFromNote(noteModel: BlockModel): {
  x: number;
  y: number;
} {
  const noteXywh = parseXywh((noteModel as { xywh?: unknown }).xywh);
  if (!noteXywh) {
    return { x: 0, y: 0 };
  }

  const [noteX, noteY, noteWidth] = noteXywh;
  return {
    x: noteX + noteWidth + KEEP_ATTACHMENTS_PAGE_GAP,
    y: noteY,
  };
}

async function readImageSize(
  blob: Blob
): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    } catch {
      // fallback below
    }
  }

  if (typeof Image !== 'undefined' && typeof URL !== 'undefined') {
    try {
      const objectUrl = URL.createObjectURL(blob);
      const size = await new Promise<{ width: number; height: number }>(
        (resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            resolve({
              width: img.naturalWidth || img.width,
              height: img.naturalHeight || img.height,
            });
          };
          img.onerror = () => reject(new Error('Failed to decode image'));
          img.src = objectUrl;
        }
      );
      URL.revokeObjectURL(objectUrl);
      return size;
    } catch {
      // fallback below
    }
  }

  return { width: KEEP_ATTACHMENTS_COLUMN_WIDTH, height: 180 };
}

async function resolveKeepAttachments(
  note: GoogleKeepNote,
  notePath: string,
  files: Map<string, Blob>
): Promise<ResolvedKeepAttachment[]> {
  if (!note.attachments?.length) {
    return [];
  }

  const result: ResolvedKeepAttachment[] = [];

  for (const attachment of note.attachments) {
    const filePath = attachment.filePath?.trim();
    if (!filePath) continue;

    const blob = resolveAttachmentBlob(notePath, filePath, files);
    if (!blob) continue;

    const mimeType =
      attachment.mimetype || blob.type || 'application/octet-stream';
    result.push({
      blob,
      fileName: toFileName(filePath),
      mimeType,
      isImage: mimeType.startsWith('image/'),
    });
  }

  return result;
}

async function appendAttachmentBlocksToDoc({
  collection,
  docId,
  attachments,
}: {
  collection: Workspace;
  docId: string;
  attachments: ResolvedKeepAttachment[];
}): Promise<void> {
  if (!attachments.length) {
    return;
  }

  const store = collection.getDoc(docId)?.getStore({ id: docId });
  if (!store) {
    return;
  }

  const noteModel = getFirstModelByFlavour(store, 'affine:note');
  if (!noteModel) {
    return;
  }

  const imageAttachments = attachments.filter(attachment => attachment.isImage);
  const fileAttachments = attachments.filter(attachment => !attachment.isImage);

  let insertIndex = 0;

  if (imageAttachments.length) {
    const surfaceModel = ensureSurfaceModel(store);
    if (surfaceModel) {
      const anchor = getAttachmentsAnchorFromNote(noteModel);
      const preparedImages = await Promise.all(
        imageAttachments.map(async attachment => {
          const blobWithType = new File(
            [attachment.blob],
            attachment.fileName,
            {
              type: attachment.mimeType,
            }
          );
          const [sourceId, naturalSize] = await Promise.all([
            store.blobSync.set(blobWithType),
            readImageSize(attachment.blob),
          ]);

          return {
            sourceId,
            naturalWidth: Math.max(1, naturalSize.width),
            naturalHeight: Math.max(1, naturalSize.height),
          };
        })
      );

      const rowHeights: number[] = [];
      const imageLayouts = preparedImages.map((image, index) => {
        const row = Math.floor(index / KEEP_ATTACHMENTS_COLUMNS);
        const col = index % KEEP_ATTACHMENTS_COLUMNS;
        // Keep aspect ratio: fit each image into column width and max row height.
        const scale = Math.min(
          KEEP_ATTACHMENTS_COLUMN_WIDTH / image.naturalWidth,
          KEEP_ATTACHMENTS_MAX_HEIGHT / image.naturalHeight
        );
        const displayWidth = Math.max(
          KEEP_ATTACHMENTS_MIN_DIMENSION,
          Math.round(image.naturalWidth * scale)
        );
        const displayHeight = Math.max(
          KEEP_ATTACHMENTS_MIN_DIMENSION,
          Math.round(image.naturalHeight * scale)
        );
        rowHeights[row] = Math.max(rowHeights[row] ?? 0, displayHeight);

        return {
          ...image,
          row,
          col,
          displayWidth,
          displayHeight,
        };
      });

      const rowOffsets: number[] = [];
      let currentY = 0;
      for (let row = 0; row < rowHeights.length; row += 1) {
        rowOffsets[row] = currentY;
        currentY += rowHeights[row] + KEEP_ATTACHMENTS_GAP;
      }

      const imageIds = imageLayouts.map(layout => {
        const colStartX =
          layout.col * (KEEP_ATTACHMENTS_COLUMN_WIDTH + KEEP_ATTACHMENTS_GAP);
        const x =
          anchor.x +
          colStartX +
          Math.max(
            0,
            Math.round(
              (KEEP_ATTACHMENTS_COLUMN_WIDTH - layout.displayWidth) / 2
            )
          );
        const y = anchor.y + rowOffsets[layout.row];

        return store.addBlock(
          'affine:image',
          {
            sourceId: layout.sourceId,
            width: layout.naturalWidth,
            height: layout.naturalHeight,
            xywh: `[${x},${y},${layout.displayWidth},${layout.displayHeight}]`,
          },
          surfaceModel
        );
      });

      if (imageIds.length) {
        const maxColumns = Math.min(KEEP_ATTACHMENTS_COLUMNS, imageIds.length);
        const contentWidth =
          maxColumns * KEEP_ATTACHMENTS_COLUMN_WIDTH +
          (maxColumns - 1) * KEEP_ATTACHMENTS_GAP;
        const rows = Math.ceil(imageIds.length / KEEP_ATTACHMENTS_COLUMNS);
        const contentHeight =
          rowHeights.slice(0, rows).reduce((sum, height) => sum + height, 0) +
          (rows - 1) * KEEP_ATTACHMENTS_GAP;

        const frameX = anchor.x - KEEP_ATTACHMENTS_FRAME_PADDING;
        const frameY = anchor.y - KEEP_ATTACHMENTS_FRAME_PADDING;
        const frameWidth = contentWidth + KEEP_ATTACHMENTS_FRAME_PADDING * 2;
        const frameHeight = contentHeight + KEEP_ATTACHMENTS_FRAME_PADDING * 2;

        const frameId = store.addBlock(
          'affine:frame',
          {
            xywh: `[${frameX},${frameY},${frameWidth},${frameHeight}]`,
          },
          surfaceModel
        );

        const frameModel = store.getModelById(frameId) as
          | (BlockModel & {
              addChildren?: (elements: BlockModel[]) => void;
              props?: { childElementIds?: Record<string, boolean> };
            })
          | null;

        const imageModels = imageIds
          .map(id => store.getModelById(id))
          .filter((model): model is BlockModel => Boolean(model));

        if (frameModel?.addChildren && imageModels.length) {
          frameModel.addChildren(imageModels);
        } else if (imageModels.length) {
          store.updateBlock(frameId, {
            childElementIds: Object.fromEntries(
              imageModels.map(model => [model.id, true])
            ),
          });
        }

        store.addBlock(
          'affine:surface-ref',
          {
            reference: frameId,
            refFlavour: 'affine:frame',
            caption: '',
          },
          noteModel,
          insertIndex
        );
        insertIndex += 1;
      }
    }
  }

  for (const attachment of fileAttachments) {
    const file = new File([attachment.blob], attachment.fileName, {
      type: attachment.mimeType,
    });
    const sourceId = await store.blobSync.set(file);

    store.addBlock(
      'affine:attachment',
      {
        name: attachment.fileName,
        size: file.size,
        type: attachment.mimeType,
        sourceId,
      },
      noteModel,
      insertIndex
    );
    insertIndex += 1;
  }
}

async function toHtml(
  note: GoogleKeepNote,
  fallbackTitle: string
): Promise<string> {
  const title = (note.title || '').trim() || fallbackTitle;
  const sections: string[] = [];

  const text = (note.textContent || '').trim();
  if (text) {
    sections.push(`<section>${renderTextContent(text)}</section>`);
  }

  if (note.listContent?.length) {
    const items = note.listContent
      .map(item => {
        const raw = (item.text || '').trim();
        if (!raw) return '';
        const checked = item.isChecked ?? item.checked ?? false;
        const marker = checked ? '☑ ' : '☐ ';
        return `<li>${marker}${escapeHtml(raw)}</li>`;
      })
      .filter(Boolean)
      .join('');
    if (items) {
      sections.push(`<section><ul>${items}</ul></section>`);
    }
  }

  if (note.isArchived || note.isTrashed || note.color) {
    const badges: string[] = [];
    if (note.isArchived) badges.push('Archived');
    if (note.isTrashed) badges.push('Trashed');
    if (note.color) badges.push(`Color: ${escapeHtml(note.color)}`);
    sections.push(`<p><em>${badges.join(' · ')}</em></p>`);
  }

  if (!sections.length) {
    sections.push('<p><em>Empty Google Keep note</em></p>');
  }

  return `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title></head><body>${sections.join('')}</body></html>`;
}

async function importGoogleKeepZip({
  collection,
  schema,
  imported,
  extensions,
  onFavoriteImported,
  onResolveTags,
  onProgress,
}: ImportGoogleKeepZipOptions): Promise<{ docIds: string[] }> {
  const unzip = new Unzip();
  await unzip.load(imported);

  const docIds: string[] = [];
  const candidates: Array<{ path: string; content: Blob }> = [];

  for (const entry of unzip) {
    if (entry.path.toLowerCase().endsWith('.json')) {
      candidates.push({ path: entry.path, content: entry.content });
    }
  }

  const notesToImport: Array<{
    note: GoogleKeepNote;
    fallbackTitle: string;
    notePath: string;
  }> = [];
  const allFiles = new Map<string, Blob>();

  for (const entry of unzip) {
    allFiles.set(normalizePath(entry.path), entry.content);
  }

  for (const candidate of candidates) {
    const fileName = candidate.path.split('/').pop() ?? 'keep-note.json';
    const fallbackTitle = fileName.replace(/\.json$/i, '') || 'Untitled';

    let note: GoogleKeepNote;
    try {
      note = JSON.parse(await candidate.content.text()) as GoogleKeepNote;
    } catch {
      continue;
    }

    // Keep exports include additional metadata JSON files. Ignore files that
    // do not look like an individual note payload.
    if (
      note.title === undefined &&
      note.textContent === undefined &&
      note.listContent === undefined
    ) {
      continue;
    }

    notesToImport.push({
      note,
      fallbackTitle,
      notePath: normalizePath(candidate.path),
    });
  }

  let importedDocs = 0;
  onProgress?.({ totalDocs: notesToImport.length, importedDocs });

  for (const { note, fallbackTitle, notePath } of notesToImport) {
    const html = await toHtml(note, fallbackTitle);
    const meta = toMeta(note, fallbackTitle);
    const tagNames = extractTagNames(note);
    const attachments = await resolveKeepAttachments(note, notePath, allFiles);

    const docId = await HtmlTransformer.importHTMLToDoc({
      collection,
      schema,
      html,
      fileName: fallbackTitle,
      extensions,
    });
    if (docId) {
      await appendAttachmentBlocksToDoc({
        collection,
        docId,
        attachments,
      });

      const tags =
        onResolveTags && tagNames.length
          ? (await onResolveTags(tagNames)).filter(Boolean)
          : undefined;
      collection.meta.setDocMeta(docId, {
        ...meta,
        ...(tags?.length ? { tags } : {}),
      });
      if (meta.favorite && onFavoriteImported) {
        await onFavoriteImported(docId);
      }
      docIds.push(docId);
      importedDocs += 1;
      onProgress?.({ totalDocs: notesToImport.length, importedDocs });
    }
  }

  return { docIds };
}

export const GoogleKeepTransformer = {
  importGoogleKeepZip,
};
