import {
  defaultImageProxyMiddleware,
  docLinkBaseURLMiddleware,
  fileNameMiddleware,
  filePathMiddleware,
  MarkdownAdapter,
  titleMiddleware,
} from '@blocksuite/affine-shared/adapters';
import { Container } from '@blocksuite/global/di';
import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import { sha } from '@blocksuite/global/utils';
import type {
  ExtensionType,
  Schema,
  Store,
  Workspace,
} from '@blocksuite/store';
import { extMimeMap, Transformer } from '@blocksuite/store';

import type { AssetMap, ImportedFileEntry, PathBlobIdMap } from './type.js';
import { createAssetsArchive, download, Unzip } from './utils.js';

function getProvider(extensions: ExtensionType[]) {
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
  const provider = getProvider(extensions);
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
      fileNameMiddleware(fileName),
      docLinkBaseURLMiddleware(collection.id),
    ],
  });
  const mdAdapter = new MarkdownAdapter(job, provider);
  const page = await mdAdapter.toDoc({
    file: markdown,
    assets: job.assetsManager,
  });
  if (!page) {
    return;
  }
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
async function importMarkdownZip({
  collection,
  schema,
  imported,
  extensions,
}: ImportMarkdownZipOptions) {
  const provider = getProvider(extensions);
  const unzip = new Unzip();
  await unzip.load(imported);

  const docIds: string[] = [];
  const pendingAssets: AssetMap = new Map();
  const pendingPathBlobIdMap: PathBlobIdMap = new Map();
  const markdownBlobs: ImportedFileEntry[] = [];

  // Iterate over all files in the zip
  for (const { path, content: blob } of unzip) {
    // Skip the files that are not markdown files
    if (path.includes('__MACOSX') || path.includes('.DS_Store')) {
      continue;
    }

    // Get the file name
    const fileName = path.split('/').pop() ?? '';
    // If the file is a markdown file, store it to markdownBlobs
    if (fileName.endsWith('.md')) {
      markdownBlobs.push({
        filename: fileName,
        contentBlob: blob,
        fullPath: path,
      });
    } else {
      // If the file is not a markdown file, store it to pendingAssets
      const ext = path.split('.').at(-1) ?? '';
      const mime = extMimeMap.get(ext) ?? '';
      const key = await sha(await blob.arrayBuffer());
      pendingPathBlobIdMap.set(path, key);
      pendingAssets.set(key, new File([blob], fileName, { type: mime }));
    }
  }

  await Promise.all(
    markdownBlobs.map(async markdownFile => {
      const { filename, contentBlob, fullPath } = markdownFile;
      const fileNameWithoutExt = filename.replace(/\.[^/.]+$/, '');
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
          fileNameMiddleware(fileNameWithoutExt),
          docLinkBaseURLMiddleware(collection.id),
          filePathMiddleware(fullPath),
        ],
      });
      const assets = job.assets;
      const pathBlobIdMap = job.assetsManager.getPathBlobIdMap();
      // Iterate over all assets to be imported
      for (const [assetPath, key] of pendingPathBlobIdMap.entries()) {
        // Get the relative path of the asset to the markdown file
        // Store the path to blobId map
        pathBlobIdMap.set(assetPath, key);
        // Store the asset to assets, the key is the blobId, the value is the file object
        // In block adapter, it will use the blobId to get the file object
        if (pendingAssets.get(key)) {
          assets.set(key, pendingAssets.get(key)!);
        }
      }

      const mdAdapter = new MarkdownAdapter(job, provider);
      const markdown = await contentBlob.text();
      const doc = await mdAdapter.toDoc({
        file: markdown,
        assets: job.assetsManager,
      });
      if (doc) {
        docIds.push(doc.id);
      }
    })
  );
  return docIds;
}

export const MarkdownTransformer = {
  exportDoc,
  importMarkdownToBlock,
  importMarkdownToDoc,
  importMarkdownZip,
};
