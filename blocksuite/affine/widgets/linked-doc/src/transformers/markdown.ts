import {
  defaultImageProxyMiddleware,
  docLinkBaseURLMiddleware,
  fileNameMiddleware,
  filePathMiddleware,
  FULL_FILE_PATH_KEY,
  getImageFullPath,
  MarkdownAdapter,
  type MarkdownAST,
  MarkdownASTToDeltaExtension,
  normalizeFilePathReference,
  titleMiddleware,
} from '@blocksuite/affine-shared/adapters';
import { Container } from '@blocksuite/global/di';
import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import { sha } from '@blocksuite/global/utils';
import type {
  DocMeta,
  ExtensionType,
  Schema,
  Store,
  Workspace,
} from '@blocksuite/store';
import { extMimeMap, Transformer } from '@blocksuite/store';

import type { AssetMap, ImportedFileEntry, PathBlobIdMap } from './type.js';
import { createAssetsArchive, download, parseMatter, Unzip } from './utils.js';

export type ParsedFrontmatterMeta = Partial<
  Pick<
    DocMeta,
    'title' | 'createDate' | 'updatedDate' | 'tags' | 'favorite' | 'trash'
  >
>;

const FRONTMATTER_KEYS = {
  title: ['title', 'name'],
  created: [
    'created',
    'createdat',
    'created_at',
    'createddate',
    'created_date',
    'creationdate',
    'date',
    'time',
  ],
  updated: [
    'updated',
    'updatedat',
    'updated_at',
    'updateddate',
    'updated_date',
    'modified',
    'modifiedat',
    'modified_at',
    'lastmodified',
    'last_modified',
    'lastedited',
    'last_edited',
    'lasteditedtime',
    'last_edited_time',
  ],
  tags: ['tags', 'tag', 'categories', 'category', 'labels', 'keywords'],
  favorite: ['favorite', 'favourite', 'star', 'starred', 'pinned'],
  trash: ['trash', 'trashed', 'deleted', 'archived'],
};

const MARKDOWN_ZIP_PAGE_ID_CONFIG_PREFIX = 'markdown-zip:page-id:';

function normalizeMarkdownZipLookupPath(path: string) {
  return normalizeFilePathReference(path).toLowerCase();
}

function stripMarkdownExtension(path: string) {
  return path.replace(/\.md$/i, '');
}

function splitMarkdownLinkTarget(url: string) {
  const queryIndex = url.indexOf('?');
  const hashIndex = url.indexOf('#');
  const splitIndex = [queryIndex, hashIndex]
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0];

  return splitIndex === undefined ? url : url.slice(0, splitIndex);
}

function isLocalMarkdownDocLink(url: string) {
  const path = splitMarkdownLinkTarget(url).trim();
  if (!path || path.startsWith('//') || path.startsWith('#')) {
    return false;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) {
    return false;
  }

  const fileName = path.split('/').at(-1) ?? '';
  return path.toLowerCase().endsWith('.md') || !fileName.includes('.');
}

function markdownAstText(ast: MarkdownAST): string {
  if ('value' in ast && typeof ast.value === 'string') {
    return ast.value;
  }
  if ('children' in ast && Array.isArray(ast.children)) {
    return ast.children.map(child => markdownAstText(child)).join('');
  }
  return '';
}

function getMarkdownZipPageIdConfigKey(path: string) {
  return `${MARKDOWN_ZIP_PAGE_ID_CONFIG_PREFIX}${normalizeMarkdownZipLookupPath(
    path
  )}`;
}

function getMarkdownZipTargetPageId(
  configs: Map<string, string>,
  currentFilePath: string,
  url: string
) {
  const targetPath = splitMarkdownLinkTarget(url);
  const fullPath = getImageFullPath(currentFilePath, targetPath);
  const candidates = [fullPath, stripMarkdownExtension(fullPath)];

  for (const candidate of candidates) {
    const pageId = configs.get(getMarkdownZipPageIdConfigKey(candidate));
    if (pageId) {
      return pageId;
    }
  }

  return null;
}

const markdownZipDocLinkToDeltaMatcher = MarkdownASTToDeltaExtension({
  name: 'markdown-zip-doc-link',
  match: ast =>
    ast.type === 'link' &&
    'url' in ast &&
    typeof ast.url === 'string' &&
    isLocalMarkdownDocLink(ast.url),
  toDelta: (ast, context) => {
    if (!('children' in ast) || !('url' in ast)) {
      return [];
    }

    const currentFilePath = context.configs.get(FULL_FILE_PATH_KEY);
    const targetPageId =
      typeof currentFilePath === 'string'
        ? getMarkdownZipTargetPageId(context.configs, currentFilePath, ast.url)
        : null;

    if (targetPageId) {
      const title = markdownAstText(ast).trim();
      return [
        {
          insert: ' ',
          attributes: {
            reference: {
              type: 'LinkedPage',
              pageId: targetPageId,
              ...(title ? { title } : {}),
            },
          },
        },
      ];
    }

    return ast.children.flatMap(child =>
      context.toDelta(child).map(delta => {
        delta.attributes = { ...delta.attributes, link: ast.url };
        return delta;
      })
    );
  },
});

const truthyStrings = new Set(['true', 'yes', 'y', '1', 'on']);
const falsyStrings = new Set(['false', 'no', 'n', '0', 'off']);

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (truthyStrings.has(normalized)) return true;
    if (falsyStrings.has(normalized)) return false;
  }
  return undefined;
}

function parseTimestamp(value: unknown): number | undefined {
  if (value && value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e10 ? value : Math.round(value * 1000);
  }
  if (typeof value === 'string') {
    const num = Number(value);
    if (!Number.isNaN(num)) {
      return num > 1e10 ? num : Math.round(num * 1000);
    }
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function parseTags(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const tags = value
      .map(v => (typeof v === 'string' ? v : String(v)))
      .map(v => v.trim())
      .filter(Boolean);
    return tags.length ? [...new Set(tags)] : undefined;
  }
  if (typeof value === 'string') {
    const tags = value
      .split(/[,;]+/)
      .map(v => v.trim())
      .filter(Boolean);
    return tags.length ? [...new Set(tags)] : undefined;
  }
  return undefined;
}

function buildMetaFromFrontmatter(
  data: Record<string, unknown>
): ParsedFrontmatterMeta {
  const meta: ParsedFrontmatterMeta = {};
  for (const [rawKey, value] of Object.entries(data)) {
    const key = rawKey.trim().toLowerCase();
    if (FRONTMATTER_KEYS.title.includes(key) && typeof value === 'string') {
      const title = value.trim();
      if (title) meta.title = title;
      continue;
    }
    if (FRONTMATTER_KEYS.created.includes(key)) {
      const timestamp = parseTimestamp(value);
      if (timestamp !== undefined) {
        meta.createDate = timestamp;
      }
      continue;
    }
    if (FRONTMATTER_KEYS.updated.includes(key)) {
      const timestamp = parseTimestamp(value);
      if (timestamp !== undefined) {
        meta.updatedDate = timestamp;
      }
      continue;
    }
    if (FRONTMATTER_KEYS.tags.includes(key)) {
      const tags = parseTags(value);
      if (tags) meta.tags = tags;
      continue;
    }
    if (FRONTMATTER_KEYS.favorite.includes(key)) {
      const favorite = parseBoolean(value);
      if (favorite !== undefined) {
        meta.favorite = favorite;
      }
      continue;
    }
    if (FRONTMATTER_KEYS.trash.includes(key)) {
      const trash = parseBoolean(value);
      if (trash !== undefined) {
        meta.trash = trash;
      }
      continue;
    }
  }
  return meta;
}

export function parseFrontmatter(markdown: string): {
  content: string;
  meta: ParsedFrontmatterMeta;
} {
  try {
    const parsed = parseMatter(markdown);
    if (!parsed) {
      return { content: markdown, meta: {} };
    }
    const content = parsed.body ?? markdown;

    if (Array.isArray(parsed.metadata)) {
      return { content: String(content), meta: {} };
    }

    const meta = buildMetaFromFrontmatter({ ...parsed.metadata });
    return { content: String(content), meta };
  } catch {
    return { content: markdown, meta: {} };
  }
}

export function applyMetaPatch(
  collection: Workspace,
  docId: string,
  meta: ParsedFrontmatterMeta
) {
  const metaPatch: Partial<DocMeta> = {};
  if (meta.title) metaPatch.title = meta.title;
  if (meta.createDate !== undefined) metaPatch.createDate = meta.createDate;
  if (meta.updatedDate !== undefined) metaPatch.updatedDate = meta.updatedDate;
  if (meta.tags) metaPatch.tags = meta.tags;
  if (meta.favorite !== undefined) metaPatch.favorite = meta.favorite;
  if (meta.trash !== undefined) metaPatch.trash = meta.trash;

  if (Object.keys(metaPatch).length) {
    collection.meta.setDocMeta(docId, metaPatch);
  }
}

export function getProvider(extensions: ExtensionType[]) {
  const container = new Container();
  extensions.forEach(ext => {
    ext.setup(container);
  });
  return container.provider();
}

type ImportMarkdownToBlockOptions = {
  doc: Store;
  markdown: string;
  blockId: string;
  extensions: ExtensionType[];
};

type ImportMarkdownToDocOptions = {
  collection: Workspace;
  schema: Schema;
  markdown: string;
  fileName?: string;
  extensions: ExtensionType[];
};

type ImportMarkdownZipOptions = {
  collection: Workspace;
  schema: Schema;
  imported: Blob;
  extensions: ExtensionType[];
};

type PrepareMarkdownFileOptions = {
  filename: string;
  markdown: string;
};

type PreparedMarkdownFile = {
  content: string;
  meta: ParsedFrontmatterMeta;
  preferredTitle: string;
};

type ImportMarkdownZipInternalOptions = ImportMarkdownZipOptions & {
  createRootFolderForTopLevelDocs?: boolean;
  normalizeFolderName?: (folderName: string) => string;
  prepareMarkdownFile?: (
    options: PrepareMarkdownFileOptions
  ) => PreparedMarkdownFile;
  preserveCommonRoot?: boolean;
  recursiveZip?: boolean;
};

function getFileNameWithoutExtension(filename: string) {
  return filename.replace(/\.[^/.]+$/, '');
}

function stripNotionHash(name: string) {
  return name
    .replace(
      /\s+[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      ''
    )
    .replace(/\s+[0-9a-f]{32}$/i, '');
}

function parseNotionMarkdownTitle(markdown: string):
  | {
      title: string;
      content: string;
    }
  | undefined {
  const match = markdown.match(/^\uFEFF?#(?!#)\s+(.+?)\s*(?:\r?\n|$)/);
  if (!match) {
    return;
  }

  const title = match?.[1]?.trim();
  if (!title) {
    return;
  }

  return {
    title,
    content: markdown.slice(match[0].length),
  };
}

function prepareDefaultMarkdownFile({
  filename,
  markdown,
}: PrepareMarkdownFileOptions): PreparedMarkdownFile {
  const fileNameWithoutExt = getFileNameWithoutExtension(filename);
  const { content, meta } = parseFrontmatter(markdown);
  return {
    content,
    meta,
    preferredTitle: meta.title ?? fileNameWithoutExt,
  };
}

function prepareNotionMarkdownFile({
  filename,
  markdown,
}: PrepareMarkdownFileOptions): PreparedMarkdownFile {
  const notionTitle = parseNotionMarkdownTitle(markdown);
  const { content, meta } = parseFrontmatter(notionTitle?.content ?? markdown);
  const fallbackTitle = stripNotionHash(getFileNameWithoutExtension(filename));
  const preferredTitle = notionTitle?.title ?? meta.title ?? fallbackTitle;

  return {
    content,
    meta: {
      ...meta,
      title: preferredTitle,
    },
    preferredTitle,
  };
}

/**
 * Filters hidden/system entries that should never participate in imports.
 */
export function isSystemImportPath(path: string) {
  return path.includes('__MACOSX') || path.includes('.DS_Store');
}

/**
 * Creates the doc CRUD bridge used by importer transformers.
 */
export function createCollectionDocCRUD(collection: Workspace) {
  return {
    create: (id: string) => collection.createDoc(id).getStore({ id }),
    get: (id: string) => collection.getDoc(id)?.getStore({ id }) ?? null,
    delete: (id: string) => collection.removeDoc(id),
  };
}

type CreateMarkdownImportJobOptions = {
  collection: Workspace;
  schema: Schema;
  preferredTitle?: string;
  fullPath?: string;
};

/**
 * Creates a markdown import job with the standard collection middlewares.
 */
export function createMarkdownImportJob({
  collection,
  schema,
  preferredTitle,
  fullPath,
}: CreateMarkdownImportJobOptions) {
  return new Transformer({
    schema,
    blobCRUD: collection.blobSync,
    docCRUD: createCollectionDocCRUD(collection),
    middlewares: [
      defaultImageProxyMiddleware,
      fileNameMiddleware(preferredTitle),
      docLinkBaseURLMiddleware(collection.id),
      ...(fullPath ? [filePathMiddleware(fullPath)] : []),
    ],
  });
}

type StageImportedAssetOptions = {
  pendingAssets: AssetMap;
  pendingPathBlobIdMap: PathBlobIdMap;
  path: string;
  content: Blob;
  fileName: string;
};

/**
 * Hashes a non-markdown import file and stages it into the shared asset maps.
 */
export async function stageImportedAsset({
  pendingAssets,
  pendingPathBlobIdMap,
  path,
  content,
  fileName,
}: StageImportedAssetOptions) {
  const ext = path.split('.').at(-1) ?? '';
  const mime = extMimeMap.get(ext.toLowerCase()) ?? '';
  const key = await sha(await content.arrayBuffer());
  pendingPathBlobIdMap.set(path, key);
  pendingAssets.set(key, new File([content], fileName, { type: mime }));
}

/**
 * Binds previously staged asset files into a transformer job before import.
 */
export function bindImportedAssetsToJob(
  job: Transformer,
  pendingAssets: AssetMap,
  pendingPathBlobIdMap: PathBlobIdMap
) {
  const pathBlobIdMap = job.assetsManager.getPathBlobIdMap();
  // Iterate over all assets to be imported
  for (const [assetPath, key] of pendingPathBlobIdMap.entries()) {
    // Get the relative path of the asset to the markdown file
    // Store the path to blobId map
    pathBlobIdMap.set(assetPath, key);
    // Store the asset to assets, the key is the blobId, the value is the file object
    // In block adapter, it will use the blobId to get the file object
    const assetFile = pendingAssets.get(key);
    if (assetFile) {
      job.assets.set(key, assetFile);
    }
  }

  return pathBlobIdMap;
}

function bindImportedMarkdownPagesToJob(
  job: Transformer,
  pagePathIdMap: ReadonlyMap<string, string>
) {
  for (const [path, pageId] of pagePathIdMap.entries()) {
    job.adapterConfigs.set(getMarkdownZipPageIdConfigKey(path), pageId);
  }
}

function registerMarkdownZipPagePath(
  pagePathIdMap: Map<string, string>,
  path: string,
  pageId: string
) {
  const normalizedPath = normalizeFilePathReference(path);
  pagePathIdMap.set(normalizedPath, pageId);
  pagePathIdMap.set(stripMarkdownExtension(normalizedPath), pageId);
}

/**
 * Exports a doc to a Markdown file or a zip archive containing Markdown and assets.
 * @param doc The doc to export
 * @returns A Promise that resolves when the export is complete
 */
async function exportDoc(doc: Store) {
  const provider = doc.provider;
  const job = doc.getTransformer([
    docLinkBaseURLMiddleware(doc.workspace.id),
    titleMiddleware(doc.workspace.meta.docMetas),
  ]);
  const snapshot = job.docToSnapshot(doc);

  const adapter = new MarkdownAdapter(job, provider);
  if (!snapshot) {
    return;
  }

  const markdownResult = await adapter.fromDocSnapshot({
    snapshot,
    assets: job.assetsManager,
  });

  let downloadBlob: Blob;
  const docTitle = doc.meta?.title || 'Untitled';
  let name: string;
  const contentBlob = new Blob([markdownResult.file], { type: 'plain/text' });
  if (markdownResult.assetsIds.length > 0) {
    if (!job.assets) {
      throw new BlockSuiteError(ErrorCode.ValueNotExists, 'No assets found');
    }
    const zip = await createAssetsArchive(job.assets, markdownResult.assetsIds);

    await zip.file('index.md', contentBlob);

    downloadBlob = await zip.generate();
    name = `${docTitle}.zip`;
  } else {
    downloadBlob = contentBlob;
    name = `${docTitle}.md`;
  }
  download(downloadBlob, name);
}

/**
 * Imports Markdown content into a specific block within a doc.
 * @param options Object containing import options
 * @param options.doc The target doc
 * @param options.markdown The Markdown content to import
 * @param options.blockId The ID of the block where the content will be imported
 * @returns A Promise that resolves when the import is complete
 */
async function importMarkdownToBlock({
  doc,
  markdown,
  blockId,
  extensions,
}: ImportMarkdownToBlockOptions) {
  const provider = getProvider(extensions);
  const job = doc.getTransformer([
    defaultImageProxyMiddleware,
    docLinkBaseURLMiddleware(doc.workspace.id),
  ]);
  const adapter = new MarkdownAdapter(job, provider);
  const snapshot = await adapter.toSliceSnapshot({
    file: markdown,
    assets: job.assetsManager,
    workspaceId: doc.workspace.id,
    pageId: doc.id,
  });

  if (!snapshot) {
    throw new BlockSuiteError(
      BlockSuiteError.ErrorCode.ValueNotExists,
      'import markdown failed, expected to get a snapshot'
    );
  }

  const blocks = snapshot.content.flatMap(x => x.children);

  for (const block of blocks) {
    await job.snapshotToBlock(block, doc, blockId);
  }

  return;
}

/**
 * Imports Markdown content into a new doc within a collection.
 * @param options Object containing import options
 * @param options.collection The target doc collection
 * @param options.schema The schema of the target doc collection
 * @param options.markdown The Markdown content to import
 * @param options.fileName Optional filename for the imported doc
 * @returns A Promise that resolves to the ID of the newly created doc, or undefined if import fails
 */
async function importMarkdownToDoc({
  collection,
  schema,
  markdown,
  fileName,
  extensions,
}: ImportMarkdownToDocOptions) {
  const { content, meta } = parseFrontmatter(markdown);
  const preferredTitle = meta.title ?? fileName;
  const provider = getProvider(extensions);
  const job = createMarkdownImportJob({
    collection,
    schema,
    preferredTitle,
  });
  const mdAdapter = new MarkdownAdapter(job, provider);
  const page = await mdAdapter.toDoc({
    file: content,
    assets: job.assetsManager,
  });
  if (!page) {
    return;
  }
  applyMetaPatch(collection, page.id, meta);
  return page.id;
}

/**
 * Imports a zip file containing Markdown files and assets into a collection.
 * @param options Object containing import options
 * @param options.collection The target doc collection
 * @param options.schema The schema of the target doc collection
 * @param options.imported The zip file as a Blob
 * @returns A Promise that resolves to an array of IDs of the newly created docs
 */
type FolderHierarchy = {
  name: string;
  path: string;
  children: Map<string, FolderHierarchy>;
  pageId?: string;
  parentPath?: string;
};

export type ImportMarkdownZipResult = {
  docIds: string[];
  folderHierarchy?: FolderHierarchy;
};

async function importMarkdownZip({
  collection,
  schema,
  imported,
  extensions,
}: ImportMarkdownZipOptions): Promise<ImportMarkdownZipResult> {
  return importMarkdownZipInternal({
    collection,
    schema,
    imported,
    extensions,
  });
}

async function importNotionMarkdownZip({
  collection,
  schema,
  imported,
  extensions,
}: ImportMarkdownZipOptions): Promise<ImportMarkdownZipResult> {
  return importMarkdownZipInternal({
    collection,
    schema,
    imported,
    extensions,
    normalizeFolderName: stripNotionHash,
    prepareMarkdownFile: prepareNotionMarkdownFile,
    preserveCommonRoot: true,
    createRootFolderForTopLevelDocs: true,
    recursiveZip: true,
  });
}

async function importMarkdownZipInternal({
  collection,
  schema,
  imported,
  extensions,
  createRootFolderForTopLevelDocs = false,
  normalizeFolderName,
  prepareMarkdownFile = prepareDefaultMarkdownFile,
  preserveCommonRoot = false,
  recursiveZip = false,
}: ImportMarkdownZipInternalOptions): Promise<ImportMarkdownZipResult> {
  const provider = getProvider([
    markdownZipDocLinkToDeltaMatcher,
    ...extensions,
  ]);
  const docIds: string[] = [];
  const pendingAssets: AssetMap = new Map();
  const pendingPathBlobIdMap: PathBlobIdMap = new Map();
  const docPathMap: Array<{ fullPath: string; docId: string }> = [];
  const pendingPagePathIdMap = new Map<string, string>();
  const markdownBlobs: Array<ImportedFileEntry & { pageId: string }> = [];

  async function collectZipEntries(zipBlob: Blob, basePath = '') {
    const unzip = new Unzip();
    await unzip.load(zipBlob);

    for (const { path, content: blob } of unzip) {
      if (isSystemImportPath(path)) {
        continue;
      }

      const fileName = path.split('/').pop() ?? '';
      const fullPath = basePath ? `${basePath}/${path}` : path;
      if (fileName.endsWith('.md')) {
        const pageId = collection.idGenerator();
        registerMarkdownZipPagePath(pendingPagePathIdMap, fullPath, pageId);
        markdownBlobs.push({
          filename: fileName,
          contentBlob: blob,
          fullPath,
          pageId,
        });
      } else if (recursiveZip && fileName.endsWith('.zip')) {
        await collectZipEntries(blob, getFileNameWithoutExtension(fullPath));
      } else {
        await stageImportedAsset({
          pendingAssets,
          pendingPathBlobIdMap,
          path: fullPath,
          content: blob,
          fileName,
        });
      }
    }
  }

  await collectZipEntries(imported);

  await Promise.all(
    markdownBlobs.map(async markdownFile => {
      const { filename, contentBlob, fullPath, pageId } = markdownFile;
      const markdown = await contentBlob.text();
      const { content, meta, preferredTitle } = prepareMarkdownFile({
        filename,
        markdown,
      });
      const job = createMarkdownImportJob({
        collection,
        schema,
        preferredTitle,
        fullPath,
      });
      bindImportedAssetsToJob(job, pendingAssets, pendingPathBlobIdMap);
      bindImportedMarkdownPagesToJob(job, pendingPagePathIdMap);

      const mdAdapter = new MarkdownAdapter(job, provider);
      const snapshot = await mdAdapter.toDocSnapshot({
        file: content,
        assets: job.assetsManager,
      });
      snapshot.meta.id = pageId;
      const doc = await job.snapshotToDoc(snapshot);
      if (doc) {
        applyMetaPatch(collection, doc.id, meta);
        docIds.push(doc.id);
        docPathMap.push({ fullPath, docId: doc.id });
      }
    })
  );

  // Build folder hierarchy from zip paths
  const folderHierarchy = buildMarkdownZipFolderHierarchy(
    docPathMap,
    normalizeFolderName,
    preserveCommonRoot,
    createRootFolderForTopLevelDocs
  );

  return { docIds, folderHierarchy };
}

/**
 * Builds a tree of {@link FolderHierarchy} nodes from the zip paths of
 * imported markdown files. Returns `undefined` when every entry sits at
 * the same level (no real subfolder structure). A common root directory
 * shared by all entries is stripped automatically so that the resulting
 * hierarchy starts one level deeper.
 */
function buildMarkdownZipFolderHierarchy(
  entries: Array<{ fullPath: string; docId: string }>,
  normalizeFolderName?: (folderName: string) => string,
  preserveCommonRoot = false,
  createRootFolderForTopLevelDocs = false
): FolderHierarchy | undefined {
  if (entries.length === 0) return undefined;

  // Check once whether all entries share a common root directory
  const candidateRoot = entries[0]?.fullPath.split('/').find(Boolean);
  const skipRoot =
    !preserveCommonRoot &&
    !!candidateRoot &&
    entries.every(e => e.fullPath.startsWith(candidateRoot + '/'));

  // Check if any entries have folder structure after the common root is stripped.
  const hasSubfolders = entries.some(e => {
    const parts = e.fullPath.split('/').filter(Boolean);
    const fileName = parts.pop();
    const folderParts = skipRoot ? parts.slice(1) : parts;
    return (
      folderParts.length > 0 || (createRootFolderForTopLevelDocs && !!fileName)
    );
  });
  if (!hasSubfolders) {
    // All files are at the same level, no folder hierarchy needed
    return undefined;
  }

  const root: FolderHierarchy = {
    name: '',
    path: '',
    children: new Map(),
  };

  for (const { fullPath, docId } of entries) {
    const parts = fullPath.split('/').filter(Boolean);
    const fileName = parts.pop(); // Remove filename
    if (!fileName) continue;

    const folderParts = skipRoot ? parts.slice(1) : parts;
    if (folderParts.length === 0 && createRootFolderForTopLevelDocs) {
      folderParts.push(getFileNameWithoutExtension(fileName));
    }

    if (folderParts.length === 0) {
      // Root-level file, no folder needed
      continue;
    }

    let current = root;
    let currentPath = '';

    for (const folderName of folderParts) {
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;

      if (!current.children.has(folderName)) {
        current.children.set(folderName, {
          name: normalizeFolderName?.(folderName) ?? folderName,
          path: currentPath,
          parentPath: parentPath || undefined,
          children: new Map(),
        });
      }
      current = current.children.get(folderName)!;
    }

    // Add the doc as a leaf
    const docNodeKey = `__doc__${docId}`;
    current.children.set(docNodeKey, {
      name: docNodeKey,
      path: `${current.path}/${docNodeKey}`,
      parentPath: current.path,
      children: new Map(),
      pageId: docId,
    });
  }

  return root.children.size > 0 ? root : undefined;
}

export const MarkdownTransformer = {
  exportDoc,
  importMarkdownToBlock,
  importMarkdownToDoc,
  importMarkdownZip,
  importNotionMarkdownZip,
};
