import {
  defaultImageProxyMiddleware,
  NotionHtmlAdapter,
} from '@blocksuite/affine-shared/adapters';
import { Container } from '@blocksuite/global/di';
import { sha } from '@blocksuite/global/utils';
import {
  type ExtensionType,
  extMimeMap,
  type Schema,
  Transformer,
  type Workspace,
} from '@blocksuite/store';

import { Unzip } from './utils.js';

type ImportNotionZipOptions = {
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
 * Imports a Notion zip file into the BlockSuite collection.
 *
 * @param options - The options for importing.
 * @param options.collection - The BlockSuite document collection.
 * @param options.schema - The schema of the BlockSuite document collection.
 * @param options.imported - The imported zip file as a Blob.
 *
 * @returns A promise that resolves to an object containing:
 *          - entryId: The ID of the entry page (if any).
 *          - pageIds: An array of imported page IDs.
 *          - isWorkspaceFile: Whether the imported file is a workspace file.
 *          - hasMarkdown: Whether the zip contains markdown files.
 */
async function importNotionZip({
  collection,
  schema,
  imported,
  extensions,
}: ImportNotionZipOptions) {
  const provider = getProvider(extensions);
  const pageIds: string[] = [];
  let isWorkspaceFile = false;
  let hasMarkdown = false;
  let entryId: string | undefined;
  const parseZipFile = async (path: File | Blob) => {
    const unzip = new Unzip();
    await unzip.load(path);
    const zipFile = new Map<string, Blob>();
    const pageMap = new Map<string, string>();
    const pagePaths: string[] = [];
    const promises: Promise<void>[] = [];
    const pendingAssets = new Map<string, Blob>();
    const pendingPathBlobIdMap = new Map<string, string>();
    for (const { path, content, index } of unzip) {
      if (path.startsWith('__MACOSX/')) continue;

      zipFile.set(path, content);

      const lastSplitIndex = path.lastIndexOf('/');

      const fileName = path.substring(lastSplitIndex + 1);
      if (fileName.endsWith('.md')) {
        hasMarkdown = true;
        continue;
      }
      if (fileName.endsWith('.html')) {
        if (path.endsWith('/index.html')) {
          isWorkspaceFile = true;
          continue;
        }
        if (lastSplitIndex !== -1) {
          const text = await content.text();
          const doc = new DOMParser().parseFromString(text, 'text/html');
          const pageBody = doc.querySelector('.page-body');
          if (pageBody && pageBody.children.length === 0) {
            // Skip empty pages
            continue;
          }
        }
        const id = collection.idGenerator();
        const splitPath = path.split('/');
        while (splitPath.length > 0) {
          pageMap.set(splitPath.join('/'), id);
          splitPath.shift();
        }
        pagePaths.push(path);
        if (entryId === undefined && lastSplitIndex === -1) {
          entryId = id;
        }
        continue;
      }
      if (index === 0 && fileName.endsWith('.csv')) {
        window.open(
          'https://affine.pro/blog/import-your-data-from-notion-into-affine',
          '_blank'
        );
        continue;
      }
      if (fileName.endsWith('.zip')) {
        const innerZipFile = content;
        if (innerZipFile) {
          promises.push(...(await parseZipFile(innerZipFile)));
        }
        continue;
      }
      const blob = content;
      const ext = path.split('.').at(-1) ?? '';
      const mime = extMimeMap.get(ext) ?? '';
      const key = await sha(await blob.arrayBuffer());
      const filePathSplit = path.split('/');
      while (filePathSplit.length > 1) {
        pendingPathBlobIdMap.set(filePathSplit.join('/'), key);
        filePathSplit.shift();
      }
      pendingAssets.set(key, new File([blob], fileName, { type: mime }));
    }
    const pagePromises = Array.from(pagePaths).map(async path => {
      const job = new Transformer({
        schema,
        blobCRUD: collection.blobSync,
        docCRUD: {
          create: (id: string) => collection.createDoc(id).getStore({ id }),
          get: (id: string) => collection.getDoc(id)?.getStore({ id }) ?? null,
          delete: (id: string) => collection.removeDoc(id),
        },
        middlewares: [defaultImageProxyMiddleware],
      });
      const htmlAdapter = new NotionHtmlAdapter(job, provider);
      const assets = job.assetsManager.getAssets();
      const pathBlobIdMap = job.assetsManager.getPathBlobIdMap();
      for (const [key, value] of pendingAssets.entries()) {
        if (!assets.has(key)) {
          assets.set(key, value);
        }
      }
      for (const [key, value] of pendingPathBlobIdMap.entries()) {
        if (!pathBlobIdMap.has(key)) {
          pathBlobIdMap.set(key, value);
        }
      }
      const page = await htmlAdapter.toDoc({
        file: await zipFile.get(path)!.text(),
        pageId: pageMap.get(path),
        pageMap,
        assets: job.assetsManager,
      });
      if (page) {
        pageIds.push(page.id);
      }
    });
    promises.push(...pagePromises);
    return promises;
  };
  const allPromises = await parseZipFile(imported);
  await Promise.all(allPromises.flat());
  entryId = entryId ?? pageIds[0];
  return { entryId, pageIds, isWorkspaceFile, hasMarkdown };
}

export const NotionHtmlTransformer = {
  importNotionZip,
};
