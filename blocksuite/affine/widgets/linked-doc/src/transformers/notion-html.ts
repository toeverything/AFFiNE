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

import {
  blobsFromAssets,
  type ImportBatch,
  type ImportDoc,
  type ImportFolder,
  type ImportIconData,
  type ImportWarning,
} from './import-batch.js';
import { Unzip } from './utils.js';

type ImportNotionZipOptions = {
  collection: Workspace;
  schema: Schema;
  imported: Blob;
  extensions: ExtensionType[];
};

export type PageIcon = {
  type: 'emoji' | 'image';
  content: string;
};

export type FolderHierarchy = {
  name: string;
  path: string;
  children: Map<string, FolderHierarchy>;
  pageId?: string;
  parentPath?: string;
  icon?: PageIcon;
};

export type PlanNotionHtmlZipResult = {
  entryId: string | undefined;
  pageIds: string[];
  isWorkspaceFile: boolean;
  hasMarkdown: boolean;
  folderHierarchy?: FolderHierarchy;
  batch: ImportBatch;
};

function getProvider(extensions: ExtensionType[]) {
  const container = new Container();
  extensions.forEach(ext => {
    ext.setup(container);
  });
  return container.provider();
}

function parseFolderPath(filePath: string): {
  folderParts: string[];
  fileName: string;
} {
  const parts = filePath.split('/');
  const fileName = parts.pop() || '';
  return { folderParts: parts.filter(part => part.length > 0), fileName };
}

function extractPageIcon(doc: Document): PageIcon | undefined {
  const notionIconSpan = doc.querySelector('.page-header-icon .icon');
  if (notionIconSpan && notionIconSpan.textContent) {
    const iconContent = notionIconSpan.textContent.trim();
    if (/\p{Emoji}/u.test(iconContent)) {
      return {
        type: 'emoji',
        content: iconContent,
      };
    }
  }

  const emojiIcon = doc.querySelector('.page-header-icon .notion-emoji');
  if (emojiIcon && emojiIcon.textContent) {
    return {
      type: 'emoji',
      content: emojiIcon.textContent.trim(),
    };
  }

  const altEmojiIcon = doc.querySelector('[role="img"][aria-label]');
  if (
    altEmojiIcon &&
    altEmojiIcon.textContent &&
    /\p{Emoji}/u.test(altEmojiIcon.textContent)
  ) {
    return {
      type: 'emoji',
      content: altEmojiIcon.textContent.trim(),
    };
  }

  const imageIcon = doc.querySelector('.page-header-icon img');
  if (imageIcon) {
    const src = imageIcon.getAttribute('src');
    if (src) {
      return {
        type: 'image',
        content: src,
      };
    }
  }

  const iconSpans = doc.querySelectorAll('span.icon');
  for (const span of iconSpans) {
    if (span.textContent && /\p{Emoji}/u.test(span.textContent.trim())) {
      const parent = span.parentElement;
      if (
        parent &&
        (parent.classList.contains('page-header-icon') ||
          parent.closest('.page-header-icon'))
      ) {
        return {
          type: 'emoji',
          content: span.textContent.trim(),
        };
      }
    }
  }

  const pageTitle = doc.querySelector('.page-title, h1');
  if (pageTitle && pageTitle.textContent) {
    const text = pageTitle.textContent.trim();
    const emojiMatch = text.match(/^(\p{Emoji}+)/u);
    if (emojiMatch) {
      return {
        type: 'emoji',
        content: emojiMatch[1],
      };
    }
  }

  return undefined;
}

function buildFolderHierarchy(
  pagePaths: Array<{ path: string; pageId: string; icon?: PageIcon }>
): FolderHierarchy {
  const root: FolderHierarchy = {
    name: '',
    path: '',
    children: new Map(),
  };

  for (const { path, pageId, icon } of pagePaths) {
    const { folderParts, fileName } = parseFolderPath(path);
    let current = root;
    let currentPath = '';

    for (const folderName of folderParts) {
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;

      if (!current.children.has(folderName)) {
        current.children.set(folderName, {
          name: folderName,
          path: currentPath,
          parentPath: parentPath || undefined,
          children: new Map(),
        });
      }
      current = current.children.get(folderName)!;
    }

    if (fileName.endsWith('.html') && !fileName.startsWith('index.html')) {
      const pageName = fileName.replace(/\.html$/, '');
      if (!current.children.has(pageName)) {
        current.children.set(pageName, {
          name: pageName,
          path: path,
          parentPath: current.path || undefined,
          children: new Map(),
          pageId: pageId,
          icon: icon,
        });
      } else {
        const existingPage = current.children.get(pageName)!;
        existingPage.pageId = pageId;
        if (icon) {
          existingPage.icon = icon;
        }
      }
    }
  }

  return root;
}

function toImportIconData(icon?: PageIcon): ImportIconData | undefined {
  if (!icon) return undefined;
  if (icon.type === 'emoji') {
    return {
      type: 'emoji',
      unicode: icon.content,
    };
  }
  return {
    type: 'image',
    content: icon.content,
  };
}

function flattenFolderHierarchy(root: FolderHierarchy): ImportFolder[] {
  const folders: ImportFolder[] = [];

  const visit = (node: FolderHierarchy) => {
    if (node.name) {
      folders.push({
        path: node.path,
        name: node.name,
        parentPath: node.parentPath,
        pageId: node.pageId,
        icon: toImportIconData(node.icon),
      });
    }
    for (const child of node.children.values()) {
      visit(child);
    }
  };

  for (const child of root.children.values()) {
    visit(child);
  }

  return folders;
}

async function planNotionHtmlZip({
  collection,
  schema,
  imported,
  extensions,
}: ImportNotionZipOptions): Promise<PlanNotionHtmlZipResult> {
  const provider = getProvider(extensions);
  const pageIds: string[] = [];
  const docs: ImportDoc[] = [];
  const blobs = new Map<
    string,
    Awaited<ReturnType<typeof blobsFromAssets>>[0]
  >();
  const warnings: ImportWarning[] = [];
  let isWorkspaceFile = false;
  let hasMarkdown = false;
  let entryId: string | undefined;
  const pagePathsWithIds: Array<{
    path: string;
    pageId: string;
    icon?: PageIcon;
  }> = [];
  const parseZipFile = async (path: File | Blob) => {
    const unzip = new Unzip();
    await unzip.load(path);
    const zipFile = new Map<string, Blob>();
    const pageMap = new Map<string, string>();
    const pagePaths: string[] = [];
    const promises: Promise<void>[] = [];
    const pendingAssets = new Map<string, File>();
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

        let pageIcon: PageIcon | undefined;
        if (lastSplitIndex !== -1) {
          const text = await content.text();
          const doc = new DOMParser().parseFromString(text, 'text/html');
          const pageBody = doc.querySelector('.page-body');
          if (pageBody && pageBody.children.length === 0) continue;
          pageIcon = extractPageIcon(doc);
        }

        const id = collection.idGenerator();
        const splitPath = path.split('/');
        while (splitPath.length > 0) {
          pageMap.set(splitPath.join('/'), id);
          splitPath.shift();
        }
        pagePaths.push(path);
        pagePathsWithIds.push({ path, pageId: id, icon: pageIcon });
        if (entryId === undefined && lastSplitIndex === -1) {
          entryId = id;
        }
        continue;
      }
      if (index === 0 && fileName.endsWith('.csv')) {
        warnings.push({
          code: 'notion-csv-export',
          message:
            'The imported Notion export appears to be CSV instead of HTML.',
          sourcePath: path,
        });
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
      const mime = extMimeMap.get(ext.toLowerCase()) ?? '';
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
      const snapshot = await htmlAdapter.toDocSnapshot({
        file: await zipFile.get(path)!.text(),
        pageId: pageMap.get(path),
        pageMap,
        assets: job.assetsManager,
      });
      docs.push({
        id: snapshot.meta.id,
        snapshot,
      });
      pageIds.push(snapshot.meta.id);
    });
    promises.push(...pagePromises);
    promises.push(
      blobsFromAssets(pendingAssets, pendingPathBlobIdMap).then(importBlobs => {
        for (const blob of importBlobs) {
          blobs.set(blob.blobId, blob);
        }
      })
    );
    return promises;
  };
  const allPromises = await parseZipFile(imported);
  await Promise.all(allPromises.flat());
  entryId = entryId ?? pageIds[0];

  const folderHierarchy =
    pagePathsWithIds.length > 0
      ? buildFolderHierarchy(pagePathsWithIds)
      : undefined;

  return {
    entryId,
    pageIds,
    isWorkspaceFile,
    hasMarkdown,
    folderHierarchy,
    batch: {
      docs,
      blobs: Array.from(blobs.values()),
      folders: folderHierarchy
        ? flattenFolderHierarchy(folderHierarchy)
        : undefined,
      warnings,
      entryId,
      isWorkspaceFile,
      done: true,
    },
  };
}

export const NotionHtmlTransformer = {
  planNotionHtmlZip,
};
