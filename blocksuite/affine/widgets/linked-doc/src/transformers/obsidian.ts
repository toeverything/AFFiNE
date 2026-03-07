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

import {
  applyMetaPatch,
  getProvider,
  type ParsedFrontmatterMeta,
  parseFrontmatter,
} from './markdown.js';
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

function extractTitleAndEmoji(rawTitle: string): {
  title: string;
  emoji: string | null;
} {
  const SINGLE_LEADING_EMOJI_RE =
    /^[\s\u200b]*((?:[\p{Emoji_Presentation}\p{Extended_Pictographic}\u200b]|\u200d|\ufe0f)+)/u;

  let currentTitle = rawTitle;
  let extractedEmojiClusters = '';
  let emojiMatch;

  while ((emojiMatch = currentTitle.match(SINGLE_LEADING_EMOJI_RE))) {
    const matchedCluster = emojiMatch[1].trim();
    extractedEmojiClusters +=
      (extractedEmojiClusters ? ' ' : '') + matchedCluster;
    currentTitle = currentTitle.slice(emojiMatch[0].length);
  }

  return {
    title: currentTitle.trim(),
    emoji: extractedEmojiClusters || null,
  };
}

function preprocessTitleHeader(markdown: string): string {
  return markdown.replace(
    /^(\s*#\s+)(.*)$/m,
    (_, headerPrefix, titleContent) => {
      const { title: cleanTitle } = extractTitleAndEmoji(titleContent);
      return `${headerPrefix}${cleanTitle}`;
    }
  );
}

function resolveWikilinkDisplayContent(
  rawAlias: string | undefined,
  pageEmoji: string | undefined
): string {
  if (!rawAlias) {
    return ' ';
  }

  const { title: aliasTitle, emoji: aliasEmoji } =
    extractTitleAndEmoji(rawAlias);

  if (aliasEmoji && aliasEmoji === pageEmoji) {
    return aliasTitle;
  }

  return rawAlias;
}

export const obsidianWikilinkToDeltaMatcher = MarkdownASTToDeltaExtension({
  name: 'obsidian-wikilink',
  match: ast => ast.type === 'text',
  toDelta: (ast, context) => {
    const textNode = ast as Text;
    if (!textNode.value) {
      return [];
    }

    const nodeContent = textNode.value;
    const wikilinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    const deltas: DeltaInsert<AffineTextAttributes>[] = [];

    let lastProcessedIndex = 0;
    let linkMatch;

    while ((linkMatch = wikilinkRegex.exec(nodeContent)) !== null) {
      if (linkMatch.index > lastProcessedIndex) {
        deltas.push({
          insert: nodeContent.substring(lastProcessedIndex, linkMatch.index),
        });
      }

      const [targetPageName, alias] = linkMatch[1]
        .split('|')
        .map(s => s.trim()) as [string, string | undefined];

      const cleanTargetTitle = extractTitleAndEmoji(targetPageName).title;
      const targetPageId =
        context.configs.get('obsidian:pageId:' + targetPageName) ||
        context.configs.get('obsidian:pageId:' + cleanTargetTitle);

      if (targetPageId) {
        const pageEmoji = context.configs.get(
          'obsidian:pageEmoji:' + targetPageId
        );
        const displayContent = resolveWikilinkDisplayContent(alias, pageEmoji);

        deltas.push({
          insert: displayContent,
          attributes: {
            reference: {
              type: 'LinkedPage',
              pageId: targetPageId,
            },
          },
        });
      } else {
        deltas.push({ insert: linkMatch[0] });
      }

      lastProcessedIndex = wikilinkRegex.lastIndex;
    }

    if (lastProcessedIndex < nodeContent.length) {
      deltas.push({ insert: nodeContent.substring(lastProcessedIndex) });
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
  content: string;
  meta: ParsedFrontmatterMeta;
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
    const filePath = file.webkitRelativePath || file.name;
    const isSystemFile =
      filePath.includes('__MACOSX') || filePath.includes('.DS_Store');

    if (isSystemFile) {
      continue;
    }

    if (file.name.endsWith('.md')) {
      const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      const markdown = await file.text();
      const { content, meta } = parseFrontmatter(markdown);

      const documentTitleCandidate = meta.title ?? fileNameWithoutExt;
      const { title: preferredTitle, emoji: leadingEmoji } =
        extractTitleAndEmoji(documentTitleCandidate);

      const newPageId = collection.idGenerator();
      titleToPageIdMap.set(documentTitleCandidate, newPageId);
      titleToPageIdMap.set(preferredTitle, newPageId);
      titleToPageIdMap.set(fileNameWithoutExt, newPageId);

      if (leadingEmoji) {
        docEmojis.set(newPageId, leadingEmoji);
      }

      markdownBlobs.push({
        filename: file.name,
        contentBlob: file,
        fullPath: filePath,
        pageId: newPageId,
        preferredTitle,
        content,
        meta,
      });
    } else {
      const ext = filePath.split('.').at(-1) ?? '';
      const mime = extMimeMap.get(ext) ?? '';
      const key = await sha(await file.arrayBuffer());
      pendingPathBlobIdMap.set(filePath, key);
      pendingAssets.set(key, new File([file], file.name, { type: mime }));
    }
  }

  for (const existingDocMeta of collection.meta.docMetas) {
    const titleExists =
      existingDocMeta.title && !titleToPageIdMap.has(existingDocMeta.title);
    if (titleExists) {
      titleToPageIdMap.set(existingDocMeta.title!, existingDocMeta.id);
    }
  }

  await Promise.all(
    markdownBlobs.map(async markdownFile => {
      const {
        fullPath,
        pageId: predefinedId,
        preferredTitle,
        content,
        meta,
      } = markdownFile;

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
