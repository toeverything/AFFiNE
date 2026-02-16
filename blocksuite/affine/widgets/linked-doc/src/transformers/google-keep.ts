import type {
  DocMeta,
  ExtensionType,
  Schema,
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

function toHtml(note: GoogleKeepNote, fallbackTitle: string): string {
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
  }> = [];

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

    notesToImport.push({ note, fallbackTitle });
  }

  let importedDocs = 0;
  onProgress?.({ totalDocs: notesToImport.length, importedDocs });

  for (const { note, fallbackTitle } of notesToImport) {
    const html = toHtml(note, fallbackTitle);
    const meta = toMeta(note, fallbackTitle);
    const tagNames = extractTagNames(note);
    const docId = await HtmlTransformer.importHTMLToDoc({
      collection,
      schema,
      html,
      fileName: fallbackTitle,
      extensions,
    });
    if (docId) {
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
