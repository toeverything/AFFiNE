import {
  defaultImageProxyMiddleware,
  docLinkBaseURLMiddleware,
  fileNameMiddleware,
  filePathMiddleware,
  HtmlAdapter,
  titleMiddleware,
} from '@blocksuite/affine-shared/adapters';
import { Container } from '@blocksuite/global/di';
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

type ImportHTMLToDocOptions = {
  collection: Workspace;
  schema: Schema;
  html: string;
  fileName?: string;
  extensions: ExtensionType[];
};

type ImportHTMLZipOptions = {
  collection: Workspace;
  schema: Schema;
  imported: Blob;
  extensions: ExtensionType[];
};

function getProvider(extensions: ExtensionType[]) {
  const container = new Container();
  extensions.forEach(ext => {
    ext.setup(container);
  });
  return container.provider();
}

/**
 * Exports a doc to HTML format.
 *
 * @param doc - The doc to be exported.
 * @returns A Promise that resolves when the export is complete.
 */
async function exportDoc(doc: Store) {
  const provider = doc.provider;
  const job = doc.getTransformer([
    docLinkBaseURLMiddleware(doc.workspace.id),
    titleMiddleware(doc.workspace.meta.docMetas),
  ]);
  const snapshot = job.docToSnapshot(doc);
  const adapter = new HtmlAdapter(job, provider);
  if (!snapshot) {
    return;
  }
  const htmlResult = await adapter.fromDocSnapshot({
    snapshot,
    assets: job.assetsManager,
  });

  let downloadBlob: Blob;
  const docTitle = doc.meta?.title || 'Untitled';
  let name: string;
  const contentBlob = new Blob([htmlResult.file], { type: 'plain/text' });
  if (htmlResult.assetsIds.length > 0) {
    const zip = await createAssetsArchive(job.assets, htmlResult.assetsIds);

    await zip.file('index.html', contentBlob);

    downloadBlob = await zip.generate();
    name = `${docTitle}.zip`;
  } else {
    downloadBlob = contentBlob;
    name = `${docTitle}.html`;
  }
  download(downloadBlob, name);
}

/**
 * Imports HTML content into a new doc within a collection.
 *
 * @param options - The import options.
 * @param options.collection - The target doc collection.
 * @param options.schema - The schema of the target doc collection.
 * @param options.html - The HTML content to import.
 * @param options.fileName - Optional filename for the imported doc.
 * @returns A Promise that resolves to the ID of the newly created doc, or undefined if import fails.
 */
async function importHTMLToDoc({
  collection,
  schema,
  html,
  fileName,
  extensions,
}: ImportHTMLToDocOptions) {
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
  const htmlAdapter = new HtmlAdapter(job, provider);
  const page = await htmlAdapter.toDoc({
    file: html,
    assets: job.assetsManager,
  });
  if (!page) {
    return;
  }
  return page.id;
}

/**
 * Imports a zip file containing HTML files and assets into a collection.
 *
 * @param options - The import options.
 * @param options.collection - The target doc collection.
 * @param options.schema - The schema of the target doc collection.
 * @param options.imported - The zip file as a Blob.
 * @returns A Promise that resolves to an array of IDs of the newly created docs.
 */
async function importHTMLZip({
  collection,
  schema,
  imported,
  extensions,
}: ImportHTMLZipOptions) {
  const provider = getProvider(extensions);
  const unzip = new Unzip();
  await unzip.load(imported);

  const docIds: string[] = [];
  const pendingAssets: AssetMap = new Map();
  const pendingPathBlobIdMap: PathBlobIdMap = new Map();
  const htmlBlobs: ImportedFileEntry[] = [];

  for (const { path, content: blob } of unzip) {
    if (path.includes('__MACOSX') || path.includes('.DS_Store')) {
      continue;
    }

    const fileName = path.split('/').pop() ?? '';
    if (fileName.endsWith('.html')) {
      htmlBlobs.push({
        filename: fileName,
        contentBlob: blob,
        fullPath: path,
      });
    } else {
      const ext = path.split('.').at(-1) ?? '';
      const mime = extMimeMap.get(ext) ?? '';
      const key = await sha(await blob.arrayBuffer());
      pendingPathBlobIdMap.set(path, key);
      pendingAssets.set(key, new File([blob], fileName, { type: mime }));
    }
  }

  await Promise.all(
    htmlBlobs.map(async htmlFile => {
      const { filename, contentBlob, fullPath } = htmlFile;
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
      for (const [assetPath, key] of pendingPathBlobIdMap.entries()) {
        pathBlobIdMap.set(assetPath, key);
        if (pendingAssets.get(key)) {
          assets.set(key, pendingAssets.get(key)!);
        }
      }
      const htmlAdapter = new HtmlAdapter(job, provider);
      const html = await contentBlob.text();
      const doc = await htmlAdapter.toDoc({
        file: html,
        assets: job.assetsManager,
      });
      if (doc) {
        docIds.push(doc.id);
      }
    })
  );
  return docIds;
}

export const HtmlTransformer = {
  exportDoc,
  importHTMLToDoc,
  importHTMLZip,
};
