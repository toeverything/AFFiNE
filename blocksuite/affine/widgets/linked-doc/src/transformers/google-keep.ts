import {
  type BlockModel,
  type DocMeta,
  type ExtensionType,
  type Schema,
  type Store,
  Text,
  type Workspace,
} from '@blocksuite/store';

import { HtmlTransformer } from './html.js';
import { Unzip } from './utils.js';

type ImportGoogleKeepZipOptions = {
  collection: Workspace;
  schema: Schema;
  imported: Blob;
  importAttachments?: boolean;
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

/**
 * Decodes a blob into text with encoding fallbacks.
 * This exists because Keep export zips may contain JSON files with BOMs or
 * non-UTF8 encodings depending on the platform/tool that created the archive.
 *
 * @param blob - The blob to decode.
 * @returns The decoded text content.
 */
async function decodeBlobText(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!bytes.length) {
    return '';
  }

  // BOM-aware fast path.
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }

  const encodings = ['utf-8', 'utf-16le', 'utf-16be', 'windows-1252'] as const;
  for (const encoding of encodings) {
    try {
      return new TextDecoder(encoding, { fatal: true }).decode(bytes);
    } catch {
      // try next
    }
  }

  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Parses a JSON blob into an object using robust text decoding first.
 *
 * @param blob - The JSON blob to parse.
 * @returns The parsed object, or `null` if decoding/parsing fails.
 */
async function parseJsonBlob<T>(blob: Blob): Promise<T | null> {
  const decoded = await decodeBlobText(blob);
  try {
    return JSON.parse(decoded) as T;
  } catch {
    return null;
  }
}

/**
 * Converts a Google Keep microsecond timestamp to milliseconds.
 *
 * @param value - Timestamp value from Keep (`*TimestampUsec` fields).
 * @returns A millisecond timestamp or `undefined` when value is invalid.
 */
function toTimestampFromUsec(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const num = Number(value);
  if (!Number.isFinite(num)) return undefined;
  return Math.round(num / 1000);
}

/**
 * Normalizes a candidate title by trimming and removing null characters.
 *
 * @param value - Candidate title value.
 * @returns A cleaned title string or an empty string.
 */
function normalizeTitle(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replaceAll('\u0000', '').trim();
}

/**
 * Tries to repair common mojibake in file names (for example `Ã¼` -> `ü`).
 *
 * @param fileName - The file name to normalize.
 * @returns The repaired name when repair succeeds, otherwise the original.
 */
function fixPotentialMojibake(fileName: string): string {
  if (!fileName) return fileName;
  const looksBroken = /Ã.|Â.|â.|�/.test(fileName);
  if (!looksBroken) return fileName;

  try {
    const bytes = Uint8Array.from(fileName, ch => ch.charCodeAt(0) & 0xff);
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (decoded && !decoded.includes('�')) {
      return decoded;
    }
  } catch {
    // keep original name
  }

  return fileName;
}

/**
 * Removes HTML tags and reduces whitespace so text can be reused as a title.
 *
 * @param text - Rich text or HTML-like input.
 * @returns Plain-text content suitable for title fallback extraction.
 */
function stripHtml(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Builds a fallback title from note content when no explicit title exists.
 *
 * @param note - Parsed Keep note payload.
 * @returns A short title candidate derived from note text/list content.
 */
function getFallbackTitleFromText(note: GoogleKeepNote): string {
  const fromText = normalizeTitle(stripHtml(note.textContent ?? ''));
  if (fromText) return fromText.slice(0, 120);

  if (note.listContent?.length) {
    const firstItem = normalizeTitle(note.listContent[0]?.text ?? '');
    if (firstItem) return firstItem.slice(0, 120);
  }

  return '';
}

/**
 * Picks the best document title using a deterministic priority:
 * Keep title -> content-derived title -> sanitized file name.
 *
 * @param note - Parsed Keep note payload.
 * @param fileName - Source JSON file name from the archive.
 * @returns The selected title used for import metadata and file naming.
 */
function pickNoteTitle(note: GoogleKeepNote, fileName: string): string {
  const fromTitle = normalizeTitle(note.title);
  if (fromTitle) return fromTitle;

  const fromContent = getFallbackTitleFromText(note);
  if (fromContent) return fromContent;

  const baseName = fileName.replace(/\.json$/i, '') || 'Untitled';
  return normalizeTitle(fixPotentialMojibake(baseName)) || 'Untitled';
}

/**
 * Maps Keep note metadata to AFFiNE doc meta fields.
 *
 * @param note - Parsed Keep note payload.
 * @param fallbackTitle - Title fallback if note title is missing/empty.
 * @returns Partial doc meta patch for title/timestamps/favorite.
 */
function toMeta(note: GoogleKeepNote, fallbackTitle: string): GoogleKeepMeta {
  const title = normalizeTitle(note.title) || fallbackTitle;
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

/**
 * Extracts unique tag names from Keep labels.
 *
 * @param note - Parsed Keep note payload.
 * @returns Deduplicated tag name list.
 */
function extractTagNames(note: GoogleKeepNote): string[] {
  return [
    ...new Set(
      (note.labels ?? [])
        .map(label => label.name?.trim())
        .filter((name): name is string => Boolean(name))
    ),
  ];
}

/**
 * Escapes text for safe embedding into generated HTML.
 *
 * @param text - Raw text value.
 * @returns HTML-escaped text.
 */
function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Checks whether text appears to already contain HTML tags.
 *
 * @param text - Candidate text.
 * @returns `true` when HTML-like tags are detected.
 */
function looksLikeHtml(text: string): boolean {
  return /<[^>]+>/.test(text);
}

/**
 * Converts plain text to paragraph HTML while preserving line breaks.
 * Existing HTML is passed through unchanged.
 *
 * @param text - Note body content.
 * @returns HTML fragment for import.
 */
function renderTextContent(text: string): string {
  if (looksLikeHtml(text)) {
    return text;
  }
  return `<p>${escapeHtml(text).replaceAll('\n', '<br/>')}</p>`;
}

/**
 * Normalizes archive paths to slash-separated relative form.
 *
 * @param path - Raw archive path.
 * @returns Normalized path.
 */
function normalizePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\.?\//, '');
}

/**
 * Returns the directory segment of a normalized path.
 *
 * @param path - File path.
 * @returns Parent directory path or empty string.
 */
function dirname(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf('/');
  return index === -1 ? '' : normalized.slice(0, index);
}

/**
 * Resolves an attachment blob for a note by trying direct and note-relative paths.
 *
 * @param notePath - Path of the source note JSON.
 * @param filePath - Attachment path from note payload.
 * @param files - Map of all files in the imported zip.
 * @returns Matching blob or `undefined`.
 */
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

/**
 * Extracts a file name from a full/relative path.
 *
 * @param path - Full or relative file path.
 * @returns Final file name segment.
 */
function toFileName(path: string): string {
  const normalized = normalizePath(path);
  return normalized.split('/').pop() || 'attachment';
}

/**
 * Returns the first model in the document matching a given flavour.
 *
 * @param store - Target document store.
 * @param flavour - Block flavour to search for.
 * @returns First matching model or `null`.
 */
function getFirstModelByFlavour(
  store: Store,
  flavour: string
): BlockModel | null {
  const block = store.getBlocksByFlavour(flavour)[0];
  return block?.model ?? null;
}

/**
 * Ensures an edgeless surface exists in the document.
 * Needed to place imported image groups as frame content in edgeless mode.
 *
 * @param store - Target document store.
 * @returns Existing or newly created surface model, otherwise `null`.
 */
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

/**
 * Parses an `xywh` serialized string into tuple coordinates.
 *
 * @param xywh - Serialized `[x,y,w,h]` string.
 * @returns Parsed tuple or `null` when format is invalid.
 */
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

/**
 * Computes the top-left anchor for attachment visuals relative to the page note.
 * The anchor is placed to the right of the note in edgeless view.
 *
 * @param noteModel - Primary note model.
 * @returns Anchor coordinates in edgeless canvas space.
 */
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

/**
 * Synchronizes root page title text with document meta title.
 * This keeps page header rendering and list metadata consistent.
 *
 * @param options - Title sync options.
 * @param options.collection - Workspace collection.
 * @param options.docId - Target document id.
 * @param options.title - Final title to apply.
 * @returns Nothing.
 */
function syncRootTitle({
  collection,
  docId,
  title,
}: {
  collection: Workspace;
  docId: string;
  title: string;
}) {
  const store = collection.getDoc(docId)?.getStore({ id: docId });
  const root = store?.root;
  if (!store || !root || root.flavour !== 'affine:page') {
    return;
  }

  const nextTitle = title.trim();
  if (!nextTitle) {
    return;
  }

  const currentTitle = String(
    (
      root as {
        props?: { title?: { toString: () => string } };
      }
    ).props?.title?.toString() ?? ''
  );
  if (currentTitle === nextTitle) {
    return;
  }

  store.updateBlock(root.id, {
    title: new Text(nextTitle),
  });
}

/**
 * Reads image dimensions from a blob, with browser API fallbacks.
 *
 * @param blob - Image blob.
 * @returns Natural width/height or a safe default size.
 */
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
      try {
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
        return size;
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch {
      // fallback below
    }
  }

  return { width: KEEP_ATTACHMENTS_COLUMN_WIDTH, height: 180 };
}

/**
 * Resolves Keep attachment descriptors into concrete blobs and metadata.
 *
 * @param note - Parsed Keep note payload.
 * @param notePath - Source note JSON path.
 * @param files - Map of all files from the import zip.
 * @returns Normalized attachment entries available for insertion.
 */
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

/**
 * Appends resolved attachments into the imported doc.
 * Images are placed in edgeless as a framed grid and linked in the note.
 * Other files are appended as attachment blocks inside the note.
 *
 * @param options - Attachment insertion options.
 * @param options.collection - Workspace collection.
 * @param options.docId - Target document id.
 * @param options.attachments - Resolved attachment entries.
 * @returns A Promise that resolves when insertion is complete.
 */
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

/**
 * Builds import HTML for the textual part of a Keep note.
 * Attachments are imported separately as native blocks.
 *
 * @param note - Parsed Keep note payload.
 * @param fallbackTitle - Title fallback for HTML document title.
 * @returns Standalone HTML document string for transformer import.
 */
function toHtml(note: GoogleKeepNote, fallbackTitle: string): string {
  const title = normalizeTitle(note.title) || fallbackTitle;
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
        // Match AFFiNE HTML list adapter expectations so Keep checklists
        // become native todo blocks instead of plain text markers.
        const checkboxClass = checked ? 'checkbox-on' : 'checkbox-off';
        return `<li><span class="${checkboxClass}"></span>${escapeHtml(raw)}</li>`;
      })
      .filter(Boolean)
      .join('');
    if (items) {
      sections.push(
        `<section><ul class="to-do-list" style="list-style-type: none; padding-inline-start: 18px;">${items}</ul></section>`
      );
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

/**
 * Imports a Google Keep Takeout zip into AFFiNE documents.
 * Each note JSON is transformed to a doc, then metadata, tags, favorites,
 * progress, and attachments are applied.
 *
 * @param options - Import options.
 * @param options.collection - Target workspace collection.
 * @param options.schema - Target schema.
 * @param options.imported - Keep Takeout zip blob.
 * @param options.extensions - Store extensions required by transformers.
 * @param options.onFavoriteImported - Optional callback for pinned notes.
 * @param options.onResolveTags - Optional callback to resolve/create tag ids.
 * @param options.onProgress - Optional callback for import progress stats.
 * @returns A Promise with ids of created docs.
 */
async function importGoogleKeepZip({
  collection,
  schema,
  imported,
  importAttachments,
  extensions,
  onFavoriteImported,
  onResolveTags,
  onProgress,
}: ImportGoogleKeepZipOptions): Promise<{ docIds: string[] }> {
  const unzip = new Unzip();
  await unzip.load(imported);

  const docIds: string[] = [];
  const candidates: Array<{ path: string; content: Blob }> = [];
  const allFiles = new Map<string, Blob>();

  for (const entry of unzip) {
    allFiles.set(normalizePath(entry.path), entry.content);
    if (entry.path.toLowerCase().endsWith('.json')) {
      candidates.push({ path: entry.path, content: entry.content });
    }
  }

  const notesToImport: Array<{
    note: GoogleKeepNote;
    fallbackTitle: string;
    notePath: string;
  }> = [];
  for (const candidate of candidates) {
    const fileName = candidate.path.split('/').pop() ?? 'keep-note.json';

    const note = await parseJsonBlob<GoogleKeepNote>(candidate.content);
    if (!note) {
      continue;
    }
    const fallbackTitle = pickNoteTitle(note, fileName);

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
  const shouldImportAttachments = importAttachments ?? true;

  for (const { note, fallbackTitle, notePath } of notesToImport) {
    try {
      const html = toHtml(note, fallbackTitle);
      const meta = toMeta(note, fallbackTitle);
      const tagNames = extractTagNames(note);
      const attachments = shouldImportAttachments
        ? await resolveKeepAttachments(note, notePath, allFiles)
        : [];

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
        syncRootTitle({
          collection,
          docId,
          title: meta.title ?? fallbackTitle,
        });
        if (meta.favorite && onFavoriteImported) {
          await onFavoriteImported(docId);
        }
        docIds.push(docId);
        importedDocs += 1;
        onProgress?.({ totalDocs: notesToImport.length, importedDocs });
      }
    } catch (error) {
      console.error(
        '[GoogleKeepTransformer] Failed to import note:',
        notePath,
        error
      );
    }
  }

  return { docIds };
}

export const GoogleKeepTransformer = {
  importGoogleKeepZip,
};
