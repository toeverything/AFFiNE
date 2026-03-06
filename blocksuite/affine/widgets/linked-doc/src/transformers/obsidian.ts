import {
  defaultImageProxyMiddleware,
  docLinkBaseURLMiddleware,
  fileNameMiddleware,
  filePathMiddleware,
  MarkdownAdapter,
  MarkdownASTToDeltaExtension,
} from '@blocksuite/affine-shared/adapters';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { sha } from '@blocksuite/global/utils';
import type {
  DeltaInsert,
  ExtensionType,
  Schema,
  Workspace,
} from '@blocksuite/store';
import { extMimeMap, Transformer } from '@blocksuite/store';

import { applyMetaPatch, getProvider, parseFrontmatter } from './markdown.js';
import type { AssetMap, ImportedFileEntry, PathBlobIdMap } from './type.js';

const OBSIDIAN_CALLOUT_TYPE_TO_EMOJI: Record<string, string> = {
  note: '💡',
  info: 'ℹ️',
  tip: '🔥',
  hint: '✅',
  important: '‼️',
  warning: '⚠️',
  caution: '⚠️',
  attention: '⚠️',
  danger: '⚠️',
  error: '🚨',
  bug: '🐛',
  example: '📌',
  quote: '💬',
  cite: '💬',
  abstract: '📋',
  summary: '📋',
  todo: '☑️',
  success: '✅',
  check: '✅',
  done: '✅',
  failure: '❌',
  fail: '❌',
  missing: '❌',
  question: '❓',
  help: '❓',
  faq: '❓',
};

// Converts Obsidian callout syntax `> [!TYPE] optional title` to AFFiNE's `> [!emoji]` format.
function preprocessObsidianCallouts(markdown: string): string {
  return markdown.replace(
    /^(> *)\[!([^\]\n]+)\]([^\n]*)/gm,
    (_, prefix, type, rest) => {
      const emoji =
        OBSIDIAN_CALLOUT_TYPE_TO_EMOJI[type.trim().toLowerCase()] ?? '💡';
      const title = rest.trim();
      return title ? `${prefix}${emoji} **${title}**` : `${prefix}${emoji}`;
    }
  );
}

// AFFiNE has no quote block — plain `> - item` / `> > nested` blockquotes outside callouts
// lose their list/link children during import. Unwrap them to top-level content instead.
function preprocessBlockquoteLists(markdown: string): string {
  return markdown.replace(
    /^(> +)([-*+]|\d+\.) +(.+)$/gm,
    (_, prefix, _bullet, content) => `${prefix}${content}`
  );
}

export const obsidianWikilinkToDeltaMatcher = MarkdownASTToDeltaExtension({
  name: 'obsidian-wikilink',
  match: (ast: any) => ast.type === 'text',
  toDelta: (ast: any, context: any) => {
    if (!('value' in ast)) {
      return [];
    }
    const val = ast.value as string;

    // [[Title]] or [[Title|Alias]]
    const wikilinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

    const deltas: DeltaInsert<AffineTextAttributes>[] = [];
    let lastIndex = 0;
    let match;

    while ((match = wikilinkRegex.exec(val)) !== null) {
      if (match.index > lastIndex) {
        deltas.push({ insert: val.substring(lastIndex, match.index) });
      }

      const title = match[1];
      const pageId = context.configs.get('obsidian:pageId:' + title);

      if (pageId) {
        deltas.push({
          insert: ' ',
          attributes: {
            reference: {
              type: 'LinkedPage',
              pageId,
            },
          },
        });
      } else {
        deltas.push({ insert: match[0] });
      }

      lastIndex = wikilinkRegex.lastIndex;
    }

    if (lastIndex < val.length) {
      deltas.push({ insert: val.substring(lastIndex) });
    }

    return deltas;
  },
});

export type ImportObsidianVaultOptions = {
  collection: Workspace;
  schema: Schema;
  importedFiles: File[];
  extensions: ExtensionType[];
};

export async function importObsidianVault({
  collection,
  schema,
  importedFiles,
  extensions,
}: ImportObsidianVaultOptions) {
  const provider = getProvider([obsidianWikilinkToDeltaMatcher, ...extensions]);

  const docIds: string[] = [];
  const pendingAssets: AssetMap = new Map();
  const pendingPathBlobIdMap: PathBlobIdMap = new Map();
  const markdownBlobs: (ImportedFileEntry & { pageId: string })[] = [];
  const titleToPageIdMap = new Map<string, string>();

  for (const file of importedFiles) {
    const path = file.webkitRelativePath || file.name;

    if (path.includes('__MACOSX') || path.includes('.DS_Store')) {
      continue;
    }

    const fileName = file.name;
    if (fileName.endsWith('.md')) {
      const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
      const markdown = await file.text();
      const { meta } = parseFrontmatter(markdown);
      const preferredTitle = meta.title ?? fileNameWithoutExt;

      const newPageId = collection.idGenerator();
      titleToPageIdMap.set(preferredTitle, newPageId);
      if (preferredTitle !== fileNameWithoutExt) {
        titleToPageIdMap.set(fileNameWithoutExt, newPageId);
      }

      markdownBlobs.push({
        filename: fileName,
        contentBlob: file,
        fullPath: path,
        pageId: newPageId,
      });
    } else {
      const ext = path.split('.').at(-1) ?? '';
      const mime = extMimeMap.get(ext) ?? '';
      const key = await sha(await file.arrayBuffer());
      pendingPathBlobIdMap.set(path, key);
      pendingAssets.set(key, new File([file], fileName, { type: mime }));
    }
  }

  for (const meta of collection.meta.docMetas) {
    if (meta.title) {
      titleToPageIdMap.set(meta.title, meta.id);
    }
  }

  await Promise.all(
    markdownBlobs.map(async markdownFile => {
      const {
        filename,
        contentBlob,
        fullPath,
        pageId: predefinedId,
      } = markdownFile;
      const fileNameWithoutExt = filename.replace(/\.[^/.]+$/, '');
      const markdown = await contentBlob.text();
      const { content, meta } = parseFrontmatter(markdown);
      const preferredTitle = meta.title ?? fileNameWithoutExt;

      const job = new Transformer({
        schema,
        blobCRUD: collection.blobSync,
        docCRUD: {
          create: (id: string) => collection.createDoc(id).getStore({ id }),
          get: (id: string) => collection.getDoc(id)?.getStore({ id }) ?? null,
          delete: (id: string) => collection.removeDoc(id),
        },
        middlewares: [
          defaultImageProxyMiddleware,
          fileNameMiddleware(preferredTitle),
          docLinkBaseURLMiddleware(collection.id),
          filePathMiddleware(fullPath),
        ],
      });

      for (const [title, id] of titleToPageIdMap.entries()) {
        job.adapterConfigs.set('obsidian:pageId:' + title, id);
      }
      const assets = job.assets;
      const pathBlobIdMap = job.assetsManager.getPathBlobIdMap();

      for (const [assetPath, key] of pendingPathBlobIdMap.entries()) {
        pathBlobIdMap.set(assetPath, key);
        if (pendingAssets.get(key)) {
          assets.set(key, pendingAssets.get(key)!);
        }
      }

      const mdAdapter = new MarkdownAdapter(job, provider);
      const snapshot = await mdAdapter.toDocSnapshot({
        file: preprocessBlockquoteLists(preprocessObsidianCallouts(content)),
        assets: job.assetsManager,
      });

      if (snapshot) {
        snapshot.meta.id = predefinedId;
        const doc = await job.snapshotToDoc(snapshot);
        if (doc) {
          applyMetaPatch(collection, doc.id, meta);
          docIds.push(doc.id);
        }
      }
    })
  );
  return docIds;
}

export const ObsidianTransformer = {
  importObsidianVault,
};
