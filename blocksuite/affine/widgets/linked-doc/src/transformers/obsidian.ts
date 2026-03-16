import {
  defaultImageProxyMiddleware,
  docLinkBaseURLMiddleware,
  fileNameMiddleware,
  filePathMiddleware,
  FULL_FILE_PATH_KEY,
  getImageFullPath,
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
import type {
  AssetMap,
  MarkdownFileImportEntry,
  PathBlobIdMap,
} from './type.js';

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

const AMBIGUOUS_PAGE_LOOKUP = '__ambiguous__';

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizePath(value: string): string {
  return decodePathSegment(value)
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/');
}

function normalizeLookupKey(value: string): string {
  return normalizePath(value).toLowerCase();
}

function stripMarkdownExtension(value: string): string {
  return value.replace(/\.md$/i, '');
}

function basename(value: string): string {
  return normalizePath(value).split('/').pop() ?? value;
}

function parseObsidianTarget(rawTarget: string): {
  path: string;
  fragment: string | null;
} {
  const normalizedTarget = normalizePath(rawTarget);
  const match = normalizedTarget.match(/^([^#^]+)([#^].*)?$/);

  return {
    path: match?.[1]?.trim() ?? normalizedTarget,
    fragment: match?.[2] ?? null,
  };
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

function preprocessObsidianCallouts(markdown: string): string {
  return markdown.replace(
    /^(> *)\[!([^\]\n]+)\]([+-]?)([^\n]*)/gm,
    (_, prefix, type, _fold, rest) => {
      const calloutToken = CALLOUT_TYPE_MAP[type.trim().toLowerCase()] ?? type;
      const title = rest.trim();
      return title
        ? `${prefix}[!${calloutToken}] ${title}`
        : `${prefix}[!${calloutToken}]`;
    }
  );
}

function buildLookupKeys(
  targetPath: string,
  currentFilePath?: string
): string[] {
  const parsedTargetPath = normalizePath(targetPath);
  if (!parsedTargetPath) {
    return [];
  }

  const keys = new Set<string>();
  const addPathVariants = (value: string) => {
    const normalizedValue = normalizePath(value);
    if (!normalizedValue) {
      return;
    }

    keys.add(normalizedValue);
    keys.add(stripMarkdownExtension(normalizedValue));

    const fileName = basename(normalizedValue);
    keys.add(fileName);
    keys.add(stripMarkdownExtension(fileName));

    const cleanTitle = extractTitleAndEmoji(
      stripMarkdownExtension(fileName)
    ).title;
    if (cleanTitle) {
      keys.add(cleanTitle);
    }
  };

  addPathVariants(parsedTargetPath);

  if (currentFilePath) {
    addPathVariants(getImageFullPath(currentFilePath, parsedTargetPath));
  }

  return Array.from(keys).map(normalizeLookupKey);
}

function registerPageLookup(
  pageLookupMap: Map<string, string>,
  key: string,
  pageId: string
) {
  const normalizedKey = normalizeLookupKey(key);
  if (!normalizedKey) {
    return;
  }

  const existing = pageLookupMap.get(normalizedKey);
  if (existing && existing !== pageId) {
    pageLookupMap.set(normalizedKey, AMBIGUOUS_PAGE_LOOKUP);
    return;
  }

  pageLookupMap.set(normalizedKey, pageId);
}

function resolvePageIdFromLookup(
  pageLookupMap: Pick<ReadonlyMap<string, string>, 'get'>,
  rawTarget: string,
  currentFilePath?: string
): string | null {
  const { path } = parseObsidianTarget(rawTarget);
  for (const key of buildLookupKeys(path, currentFilePath)) {
    const targetPageId = pageLookupMap.get(key);
    if (!targetPageId || targetPageId === AMBIGUOUS_PAGE_LOOKUP) {
      continue;
    }
    return targetPageId;
  }

  return null;
}

function resolveWikilinkDisplayTitle(
  rawAlias: string | undefined,
  pageEmoji: string | undefined
): string | undefined {
  if (!rawAlias) {
    return undefined;
  }

  const { title: aliasTitle, emoji: aliasEmoji } =
    extractTitleAndEmoji(rawAlias);

  if (aliasEmoji && aliasEmoji === pageEmoji) {
    return aliasTitle;
  }

  return rawAlias;
}

function isImageAssetPath(path: string): boolean {
  const extension = path.split('.').at(-1)?.toLowerCase() ?? '';
  return extMimeMap.get(extension)?.startsWith('image/') ?? false;
}

function encodeMarkdownPath(path: string): string {
  return encodeURI(path).replaceAll('(', '%28').replaceAll(')', '%29');
}

function escapeMarkdownLabel(label: string): string {
  return label.replace(/[[\]\\]/g, '\\$&');
}

function isObsidianSizeAlias(alias: string | undefined): boolean {
  return !!alias && /^\d+(?:x\d+)?$/i.test(alias.trim());
}

function getEmbedLabel(
  rawAlias: string | undefined,
  targetPath: string,
  fallbackToFileName: boolean
): string {
  if (!rawAlias || isObsidianSizeAlias(rawAlias)) {
    return fallbackToFileName
      ? stripMarkdownExtension(basename(targetPath))
      : '';
  }

  return rawAlias.trim();
}

function preprocessObsidianEmbeds(
  markdown: string,
  filePath: string,
  pageLookupMap: ReadonlyMap<string, string>
): string {
  return markdown.replace(
    /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (match, rawTarget: string, rawAlias?: string) => {
      const targetPageId = resolvePageIdFromLookup(
        pageLookupMap,
        rawTarget,
        filePath
      );
      if (targetPageId) {
        return `[[${rawTarget}${rawAlias ? `|${rawAlias}` : ''}]]`;
      }

      const { path } = parseObsidianTarget(rawTarget);
      if (!path) {
        return match;
      }

      const assetPath = getImageFullPath(filePath, path);
      const encodedPath = encodeMarkdownPath(assetPath);

      if (isImageAssetPath(path)) {
        const alt = getEmbedLabel(rawAlias, path, false);
        return `![${escapeMarkdownLabel(alt)}](${encodedPath})`;
      }

      const label = getEmbedLabel(rawAlias, path, true);
      return `[${escapeMarkdownLabel(label)}](${encodedPath})`;
    }
  );
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

      const targetPageName = linkMatch[1].trim();
      const alias = linkMatch[2]?.trim();
      const currentFilePath = context.configs.get(FULL_FILE_PATH_KEY);
      const targetPageId = resolvePageIdFromLookup(
        { get: key => context.configs.get(`obsidian:pageId:${key}`) },
        targetPageName,
        typeof currentFilePath === 'string' ? currentFilePath : undefined
      );

      if (targetPageId) {
        const pageEmoji = context.configs.get(
          'obsidian:pageEmoji:' + targetPageId
        );
        const displayTitle = resolveWikilinkDisplayTitle(alias, pageEmoji);

        deltas.push({
          insert: ' ',
          attributes: {
            reference: {
              type: 'LinkedPage',
              pageId: targetPageId,
              ...(displayTitle ? { title: displayTitle } : {}),
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
  const pageLookupMap = new Map<string, string>();

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
      registerPageLookup(pageLookupMap, filePath, newPageId);
      registerPageLookup(
        pageLookupMap,
        stripMarkdownExtension(filePath),
        newPageId
      );
      registerPageLookup(pageLookupMap, file.name, newPageId);
      registerPageLookup(pageLookupMap, fileNameWithoutExt, newPageId);
      registerPageLookup(pageLookupMap, documentTitleCandidate, newPageId);
      registerPageLookup(pageLookupMap, preferredTitle, newPageId);

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
      const mime = extMimeMap.get(ext.toLowerCase()) ?? '';
      const key = await sha(await file.arrayBuffer());
      pendingPathBlobIdMap.set(filePath, key);
      pendingAssets.set(key, new File([file], file.name, { type: mime }));
    }
  }

  for (const existingDocMeta of collection.meta.docMetas) {
    if (existingDocMeta.title) {
      registerPageLookup(
        pageLookupMap,
        existingDocMeta.title,
        existingDocMeta.id
      );
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

      for (const [lookupKey, id] of pageLookupMap.entries()) {
        if (id === AMBIGUOUS_PAGE_LOOKUP) {
          continue;
        }
        job.adapterConfigs.set(`obsidian:pageId:${lookupKey}`, id);
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
          preprocessObsidianEmbeds(
            preprocessObsidianCallouts(content),
            fullPath,
            pageLookupMap
          )
        ),
        assets: job.assetsManager,
      });

      if (snapshot) {
        snapshot.meta.id = predefinedId;
        const doc = await job.snapshotToDoc(snapshot);
        if (doc) {
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
