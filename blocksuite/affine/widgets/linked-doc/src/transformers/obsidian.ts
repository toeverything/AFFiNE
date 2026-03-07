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
import type { Text } from 'mdast';

import { applyMetaPatch, getProvider, parseFrontmatter } from './markdown.js';
import type { AssetMap, ImportedFileEntry, PathBlobIdMap } from './type.js';

const CALLOUT_TYPE_MAP: Record<string, string> = {
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

function preprocessObsidianCallouts(markdown: string): string {
  return markdown.replace(
    /^(> *)\[!([^\]\n]+)\]([^\n]*)/gm,
    (_, prefix, type, rest) => {
      const emoji = CALLOUT_TYPE_MAP[type.trim().toLowerCase()] ?? '💡';
      const title = rest.trim();
      return title ? `${prefix}${emoji} **${title}**` : `${prefix}${emoji}`;
    }
  );
}

function preprocessBlockquoteLists(markdown: string): string {
  return markdown.replace(
    /^(> +)([-*+]|\d+\.) +(.+)$/gm,
    (_, prefix, _bullet, content) => `${prefix}${content}`
  );
}

/**
 * Aggressively extracts all leading emojis from a string, including multiple clusters.
 */
function extractTitleAndEmoji(rawTitle: string): {
  title: string;
  emoji: string | null;
} {
  // Use non-capturing group for combining characters to avoid ESLint warning
  const SINGLE_LEADING_EMOJI_RE =
    /^[\s\u200b]*((?:[\p{Emoji_Presentation}\p{Extended_Pictographic}\u200b]|\u200d|\ufe0f)+)/u;

  let current = rawTitle;
  let extractedEmoji = '';
  let match;

  while ((match = current.match(SINGLE_LEADING_EMOJI_RE))) {
    extractedEmoji += (extractedEmoji ? ' ' : '') + match[1].trim();
    current = current.slice(match[0].length);
  }

  const cleanedTitle = current.trim();
  return {
    title: cleanedTitle,
    emoji: extractedEmoji || null,
  };
}

function preprocessTitleHeader(markdown: string): string {
  // Only process the first H1 header found at the start of a line
  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h1Match = line.match(/^(\s*#\s+)(.*)$/);
    if (h1Match) {
      const { title } = extractTitleAndEmoji(h1Match[2]);
      lines[i] = `${h1Match[1]}${title}`;
      break; // Only strip from the primary title header
    }
  }
  return lines.join('\n');
}

export const obsidianWikilinkToDeltaMatcher = MarkdownASTToDeltaExtension({
  name: 'obsidian-wikilink',
  match: ast => ast.type === 'text',
  toDelta: (ast, context) => {
    const textNode = ast as Text;
    if (!textNode.value) {
      return [];
    }
    const val = textNode.value;

    // [[Title]] or [[Title|Alias]]
    const wikilinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

    const deltas: DeltaInsert<AffineTextAttributes>[] = [];
    let lastIndex = 0;
    let match;

    while ((match = wikilinkRegex.exec(val)) !== null) {
      if (match.index > lastIndex) {
        deltas.push({ insert: val.substring(lastIndex, match.index) });
      }

      const [rawTarget, rawAlias] = match[1].split('|').map(s => s.trim()) as [
        string,
        string | undefined,
      ];
      const pageId =
        context.configs.get('obsidian:pageId:' + rawTarget) ||
        context.configs.get(
          'obsidian:pageId:' + extractTitleAndEmoji(rawTarget).title
        );

      if (pageId) {
        const pageEmoji = context.configs.get('obsidian:pageEmoji:' + pageId);
        let displayContent = rawAlias || ' ';

        if (rawAlias) {
          const aliasInfo = extractTitleAndEmoji(rawAlias);
          // If the alias has a leading emoji that matches the page emoji, strip it
          if (aliasInfo.emoji && aliasInfo.emoji === pageEmoji) {
            displayContent = aliasInfo.title;
          } else {
            displayContent = rawAlias;
          }
        } else {
          // Use a reference with a single space as display text.
          // This forces AFFiNE to render the page title from metadata, which we've cleaned.
          displayContent = ' ';
        }

        deltas.push({
          insert: displayContent,
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

export type ImportObsidianVaultResult = {
  docIds: string[];
  docEmojis: Map<string, string>;
};

type MarkdownFileImportEntry = ImportedFileEntry & {
  pageId: string;
  preferredTitle: string;
};

export async function importObsidianVault({
  collection,
  schema,
  importedFiles,
  extensions,
}: ImportObsidianVaultOptions): Promise<ImportObsidianVaultResult> {
  const provider = getProvider([obsidianWikilinkToDeltaMatcher, ...extensions]);

  const docIds: string[] = [];
  const docEmojis = new Map<string, string>();
  const pendingAssets: AssetMap = new Map();
  const pendingPathBlobIdMap: PathBlobIdMap = new Map();
  const markdownBlobs: MarkdownFileImportEntry[] = [];
  const titleToPageIdMap = new Map<string, string>();

  for (const file of importedFiles) {
    const path = file.webkitRelativePath || file.name;

    // Skip OS or build-related files
    if (path.includes('__MACOSX') || path.includes('.DS_Store')) {
      continue;
    }

    if (file.name.endsWith('.md')) {
      const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      const markdown = await file.text();
      const { meta } = parseFrontmatter(markdown);

      // 1. Resolve title and emoji
      const { title: preferredTitle, emoji: leadingEmoji } =
        extractTitleAndEmoji(meta.title ?? fileNameWithoutExt);

      // 2. Register mapping for cross-document links
      const newPageId = collection.idGenerator();
      titleToPageIdMap.set(meta.title ?? fileNameWithoutExt, newPageId);
      titleToPageIdMap.set(preferredTitle, newPageId);
      titleToPageIdMap.set(fileNameWithoutExt, newPageId);

      if (leadingEmoji) {
        docEmojis.set(newPageId, leadingEmoji);
      }

      markdownBlobs.push({
        filename: file.name,
        contentBlob: file,
        fullPath: path,
        pageId: newPageId,
        preferredTitle,
      });
    } else {
      const ext = path.split('.').at(-1) ?? '';
      const mime = extMimeMap.get(ext) ?? '';
      const key = await sha(await file.arrayBuffer());
      pendingPathBlobIdMap.set(path, key);
      pendingAssets.set(key, new File([file], file.name, { type: mime }));
    }
  }

  // Register existing documents in the workspace for cross-linking,
  // but DO NOT overwrite IDs that were just generated for this import batch.
  // This prevents wikilinks from resolving to old/trashed versions of the same file.
  for (const meta of collection.meta.docMetas) {
    if (meta.title && !titleToPageIdMap.has(meta.title)) {
      titleToPageIdMap.set(meta.title, meta.id);
    }
  }

  // Second pass: Actually create the documents and process the content
  await Promise.all(
    markdownBlobs.map(async markdownFile => {
      const {
        contentBlob,
        fullPath,
        pageId: predefinedId,
        preferredTitle,
      } = markdownFile;

      const markdown = await contentBlob.text();
      const { content, meta } = parseFrontmatter(markdown);

      const job = new Transformer({
        schema,
        blobCRUD: collection.blobSync,
        docCRUD: {
          create: id => collection.createDoc(id).getStore({ id }),
          get: id => collection.getDoc(id)?.getStore({ id }) ?? null,
          delete: id => collection.removeDoc(id),
        },
        middlewares: [
          defaultImageProxyMiddleware,
          fileNameMiddleware(preferredTitle),
          docLinkBaseURLMiddleware(collection.id),
          filePathMiddleware(fullPath),
        ],
      });

      // Inject cross-page links mapping and assets mapping
      for (const [title, id] of titleToPageIdMap.entries()) {
        job.adapterConfigs.set('obsidian:pageId:' + title, id);
      }
      for (const [id, emoji] of docEmojis.entries()) {
        job.adapterConfigs.set('obsidian:pageEmoji:' + id, emoji);
      }

      const pathBlobIdMap = job.assetsManager.getPathBlobIdMap();
      for (const [assetPath, key] of pendingPathBlobIdMap.entries()) {
        pathBlobIdMap.set(assetPath, key);
        const assetFile = pendingAssets.get(key);
        if (assetFile) {
          job.assets.set(key, assetFile);
        }
      }

      const mdAdapter = new MarkdownAdapter(job, provider);
      const snapshot = await mdAdapter.toDocSnapshot({
        file: preprocessTitleHeader(
          preprocessBlockquoteLists(preprocessObsidianCallouts(content))
        ),
        assets: job.assetsManager,
      });

      if (snapshot) {
        snapshot.meta.id = predefinedId;
        const doc = await job.snapshotToDoc(snapshot);
        if (doc) {
          // Ensure DocMeta title matches the stripped title to avoid double icons
          // and ensure metadata reflects the cleaned name.
          console.log(
            'meta.title',
            meta.title,
            'preferredTitle',
            preferredTitle
          );
          meta.title = preferredTitle;
          applyMetaPatch(collection, doc.id, {
            ...meta,
            title: preferredTitle,
            trash: false,
          });
          docIds.push(doc.id);
        }
      }
    })
  );

  return { docIds, docEmojis };
}

export const ObsidianTransformer = {
  importObsidianVault,
};
