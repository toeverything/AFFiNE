import { FootNoteReferenceParamsSchema } from '@blocksuite/affine-model';
import {
  BlockMarkdownAdapterExtension,
  createAttachmentBlockSnapshot,
  FULL_FILE_PATH_KEY,
  getImageFullPath,
  MarkdownAdapter,
  type MarkdownAST,
  MarkdownASTToDeltaExtension,
  normalizeFilePathReference,
} from '@blocksuite/affine-shared/adapters';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import type {
  DeltaInsert,
  ExtensionType,
  Schema,
  Workspace,
} from '@blocksuite/store';
import { extMimeMap, nanoid } from '@blocksuite/store';
import type { Html, Text } from 'mdast';

import {
  applyMetaPatch,
  bindImportedAssetsToJob,
  createMarkdownImportJob,
  getProvider,
  isSystemImportPath,
  parseFrontmatter,
  stageImportedAsset,
} from './markdown.js';
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
const DEFAULT_CALLOUT_EMOJI = '💡';
const OBSIDIAN_TEXT_FOOTNOTE_URL_PREFIX = 'data:text/plain;charset=utf-8,';
const OBSIDIAN_ATTACHMENT_EMBED_TAG = 'obsidian-attachment';

function normalizeLookupKey(value: string): string {
  return normalizeFilePathReference(value).toLowerCase();
}

function stripMarkdownExtension(value: string): string {
  return value.replace(/\.md$/i, '');
}

function basename(value: string): string {
  return normalizeFilePathReference(value).split('/').pop() ?? value;
}

function parseObsidianTarget(rawTarget: string): {
  path: string;
  fragment: string | null;
} {
  const normalizedTarget = normalizeFilePathReference(rawTarget);
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
      const calloutToken =
        CALLOUT_TYPE_MAP[type.trim().toLowerCase()] ?? DEFAULT_CALLOUT_EMOJI;
      const title = rest.trim();
      return title
        ? `${prefix}[!${calloutToken}] ${title}`
        : `${prefix}[!${calloutToken}]`;
    }
  );
}

function isStructuredFootnoteDefinition(content: string): boolean {
  try {
    return FootNoteReferenceParamsSchema.safeParse(JSON.parse(content.trim()))
      .success;
  } catch {
    return false;
  }
}

function splitFootnoteTextContent(content: string): {
  title: string;
  description?: string;
} {
  const lines = content
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  const title = lines[0] ?? content.trim();
  const description = lines.slice(1).join('\n').trim();

  return {
    title,
    ...(description ? { description } : {}),
  };
}

function createTextFootnoteDefinition(content: string): string {
  const normalizedContent = content.trim();
  const { title, description } = splitFootnoteTextContent(normalizedContent);

  return JSON.stringify({
    type: 'url',
    url: encodeURIComponent(
      `${OBSIDIAN_TEXT_FOOTNOTE_URL_PREFIX}${encodeURIComponent(
        normalizedContent
      )}`
    ),
    title,
    ...(description ? { description } : {}),
  });
}

function extractObsidianFootnotes(markdown: string): {
  content: string;
  footnotes: string[];
} {
  const lines = markdown.split('\n');
  const output: string[] = [];
  const footnotes: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^\[\^([^\]]+)\]:\s*(.*)$/);
    if (!match) {
      output.push(line);
      continue;
    }

    const identifier = match[1];
    const contentLines = [match[2]];

    while (index + 1 < lines.length) {
      const nextLine = lines[index + 1];
      if (/^(?: {1,4}|\t)/.test(nextLine)) {
        contentLines.push(nextLine.replace(/^(?: {1,4}|\t)/, ''));
        index += 1;
        continue;
      }

      if (
        nextLine.trim() === '' &&
        index + 2 < lines.length &&
        /^(?: {1,4}|\t)/.test(lines[index + 2])
      ) {
        contentLines.push('');
        index += 1;
        continue;
      }

      break;
    }

    const content = contentLines.join('\n').trim();
    footnotes.push(
      `[^${identifier}]: ${
        !content || isStructuredFootnoteDefinition(content)
          ? content
          : createTextFootnoteDefinition(content)
      }`
    );
  }

  return { content: output.join('\n'), footnotes };
}

function buildLookupKeys(
  targetPath: string,
  currentFilePath?: string
): string[] {
  const parsedTargetPath = normalizeFilePathReference(targetPath);
  if (!parsedTargetPath) {
    return [];
  }

  const keys = new Set<string>();
  const addPathVariants = (value: string) => {
    const normalizedValue = normalizeFilePathReference(value);
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

type ObsidianAttachmentEmbed = {
  blobId: string;
  fileName: string;
  fileType: string;
};

function createObsidianAttach(embed: ObsidianAttachmentEmbed): string {
  return `<!-- ${OBSIDIAN_ATTACHMENT_EMBED_TAG} ${encodeURIComponent(
    JSON.stringify(embed)
  )} -->`;
}

function parseObsidianAttach(value: string): ObsidianAttachmentEmbed | null {
  const match = value.match(
    new RegExp(`^<!-- ${OBSIDIAN_ATTACHMENT_EMBED_TAG} ([^ ]+) -->$`)
  );
  if (!match?.[1]) return null;

  try {
    const parsed = JSON.parse(
      decodeURIComponent(match[1])
    ) as ObsidianAttachmentEmbed;
    if (!parsed.blobId || !parsed.fileName) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function preprocessObsidianEmbeds(
  markdown: string,
  filePath: string,
  pageLookupMap: ReadonlyMap<string, string>,
  pathBlobIdMap: ReadonlyMap<string, string>
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
      const blobId = pathBlobIdMap.get(assetPath);
      if (!blobId) return `[${escapeMarkdownLabel(label)}](${encodedPath})`;

      const extension = path.split('.').at(-1)?.toLowerCase() ?? '';
      return createObsidianAttach({
        blobId,
        fileName: basename(path),
        fileType: extMimeMap.get(extension) ?? '',
      });
    }
  );
}

function preprocessObsidianMarkdown(
  markdown: string,
  filePath: string,
  pageLookupMap: ReadonlyMap<string, string>,
  pathBlobIdMap: ReadonlyMap<string, string>
): string {
  const { content: contentWithoutFootnotes, footnotes: extractedFootnotes } =
    extractObsidianFootnotes(markdown);
  const content = preprocessObsidianEmbeds(
    contentWithoutFootnotes,
    filePath,
    pageLookupMap,
    pathBlobIdMap
  );
  const normalizedMarkdown = preprocessTitleHeader(
    preprocessObsidianCallouts(content)
  );

  if (extractedFootnotes.length === 0) {
    return normalizedMarkdown;
  }

  const trimmedMarkdown = normalizedMarkdown.replace(/\s+$/, '');
  return `${trimmedMarkdown}\n\n${extractedFootnotes.join('\n\n')}\n`;
}

function isObsidianAttachmentEmbedNode(node: MarkdownAST): node is Html {
  return node.type === 'html' && !!parseObsidianAttach(node.value);
}

export const obsidianAttachmentEmbedMarkdownAdapterMatcher =
  BlockMarkdownAdapterExtension({
    flavour: 'obsidian:attachment-embed',
    toMatch: o => isObsidianAttachmentEmbedNode(o.node),
    fromMatch: () => false,
    toBlockSnapshot: {
      enter: (o, context) => {
        if (!isObsidianAttachmentEmbedNode(o.node)) {
          return;
        }

        const attachment = parseObsidianAttach(o.node.value);
        if (!attachment) {
          return;
        }

        const assetFile = context.assets?.getAssets().get(attachment.blobId);
        context.walkerContext
          .openNode(
            createAttachmentBlockSnapshot({
              id: nanoid(),
              props: {
                name: attachment.fileName,
                size: assetFile?.size ?? 0,
                type:
                  attachment.fileType ||
                  assetFile?.type ||
                  'application/octet-stream',
                sourceId: attachment.blobId,
                embed: false,
                style: 'horizontalThin',
                footnoteIdentifier: null,
              },
            }),
            'children'
          )
          .closeNode();
        (o.node as unknown as { type: string }).type =
          'obsidianAttachmentEmbed';
      },
    },
    fromBlockSnapshot: {},
  });

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
  const provider = getProvider([
    obsidianWikilinkToDeltaMatcher,
    obsidianAttachmentEmbedMarkdownAdapterMatcher,
    ...extensions,
  ]);

  const docIds: string[] = [];
  const docEmojis = new Map<string, string>();
  const pendingAssets: AssetMap = new Map();
  const pendingPathBlobIdMap: PathBlobIdMap = new Map();
  const markdownBlobs: MarkdownFileImportEntry[] = [];
  const pageLookupMap = new Map<string, string>();

  for (const file of importedFiles) {
    const filePath = file.webkitRelativePath || file.name;
    if (isSystemImportPath(filePath)) continue;

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
      await stageImportedAsset({
        pendingAssets,
        pendingPathBlobIdMap,
        path: filePath,
        content: file,
        fileName: file.name,
      });
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

      const job = createMarkdownImportJob({
        collection,
        schema,
        preferredTitle,
        fullPath,
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

      const pathBlobIdMap = bindImportedAssetsToJob(
        job,
        pendingAssets,
        pendingPathBlobIdMap
      );

      const preprocessedMarkdown = preprocessObsidianMarkdown(
        content,
        fullPath,
        pageLookupMap,
        pathBlobIdMap
      );
      const mdAdapter = new MarkdownAdapter(job, provider);
      const snapshot = await mdAdapter.toDocSnapshot({
        file: preprocessedMarkdown,
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
