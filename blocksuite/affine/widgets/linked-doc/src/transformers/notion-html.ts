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

type PageIcon = {
  type: 'emoji' | 'image';
  content: string; // emoji unicode or image URL/data
};

type FolderHierarchy = {
  name: string;
  path: string;
  children: Map<string, FolderHierarchy>;
  pageId?: string;
  parentPath?: string;
  icon?: PageIcon;
};

type ImportNotionZipResult = {
  entryId: string | undefined;
  pageIds: string[];
  isWorkspaceFile: boolean;
  hasMarkdown: boolean;
  folderHierarchy?: FolderHierarchy;
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
  // Look for Notion page icon in the HTML
  // Notion export format: <div class="page-header-icon undefined"><span class="icon">✅</span></div>

  console.log('=== Extracting page icon ===');

  // Check if there's a head section with title for debugging
  const headTitle = doc.querySelector('head title');
  if (headTitle) {
    console.log('Page title from head:', headTitle.textContent);
  }

  // Look for the exact Notion export structure: .page-header-icon .icon
  const notionIconSpan = doc.querySelector('.page-header-icon .icon');
  if (notionIconSpan && notionIconSpan.textContent) {
    const iconContent = notionIconSpan.textContent.trim();
    console.log('Found Notion icon (.page-header-icon .icon):', iconContent);
    if (/\p{Emoji}/u.test(iconContent)) {
      return {
        type: 'emoji',
        content: iconContent,
      };
    }
  }

  // Look for page header area for debugging
  const pageHeader = doc.querySelector('.page-header-icon');
  if (pageHeader) {
    console.log(
      'Found .page-header-icon:',
      pageHeader.outerHTML.substring(0, 300) + '...'
    );
  }

  // Fallback: try to find emoji icons with older selectors
  const emojiIcon = doc.querySelector('.page-header-icon .notion-emoji');
  if (emojiIcon && emojiIcon.textContent) {
    console.log(
      'Found emoji icon (.page-header-icon .notion-emoji):',
      emojiIcon.textContent
    );
    return {
      type: 'emoji',
      content: emojiIcon.textContent.trim(),
    };
  }

  // Try alternative emoji selectors
  const altEmojiIcon = doc.querySelector('[role="img"][aria-label]');
  if (
    altEmojiIcon &&
    altEmojiIcon.textContent &&
    /\p{Emoji}/u.test(altEmojiIcon.textContent)
  ) {
    console.log(
      'Found emoji icon ([role="img"][aria-label]):',
      altEmojiIcon.textContent
    );
    return {
      type: 'emoji',
      content: altEmojiIcon.textContent.trim(),
    };
  }

  // Look for image icons in the page header
  const imageIcon = doc.querySelector('.page-header-icon img');
  if (imageIcon) {
    const src = imageIcon.getAttribute('src');
    console.log('Found image icon (.page-header-icon img):', src);
    if (src) {
      return {
        type: 'image',
        content: src,
      };
    }
  }

  // Fallback: Look for any span with emoji class "icon" in page header area
  const iconSpans = doc.querySelectorAll('span.icon');
  for (const span of iconSpans) {
    if (span.textContent && /\p{Emoji}/u.test(span.textContent.trim())) {
      const parent = span.parentElement;
      console.log(
        'Found emoji in span.icon:',
        span.textContent,
        'parent classes:',
        parent?.className
      );
      // Check if this is in a page header context
      if (
        parent &&
        (parent.classList.contains('page-header-icon') ||
          parent.closest('.page-header-icon'))
      ) {
        console.log(
          'Using emoji from span.icon in page header:',
          span.textContent
        );
        return {
          type: 'emoji',
          content: span.textContent.trim(),
        };
      }
    }
  }

  // Fallback: Try to find icons in the page title area that might contain emoji
  const pageTitle = doc.querySelector('.page-title, h1');
  if (pageTitle && pageTitle.textContent) {
    console.log('Page title element found:', pageTitle.textContent);
    const text = pageTitle.textContent.trim();
    // Check if the title starts with an emoji
    const emojiMatch = text.match(/^(\p{Emoji}+)/u);
    if (emojiMatch) {
      console.log('Found emoji in title:', emojiMatch[1]);
      return {
        type: 'emoji',
        content: emojiMatch[1],
      };
    }
  }

  console.log('No page icon found');
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

    // Navigate/create folder structure
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

    // If this is a page file, associate it with the current folder
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
        // Update existing entry with pageId and icon
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
 *          - folderHierarchy: The parsed folder hierarchy from the Notion export.
 */
async function importNotionZip({
  collection,
  schema,
  imported,
  extensions,
}: ImportNotionZipOptions): Promise<ImportNotionZipResult> {
  const provider = getProvider(extensions);
  const pageIds: string[] = [];
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

        let pageIcon: PageIcon | undefined;
        if (lastSplitIndex !== -1) {
          const text = await content.text();
          const doc = new DOMParser().parseFromString(text, 'text/html');
          const pageBody = doc.querySelector('.page-body');
          if (pageBody && pageBody.children.length === 0) {
            // Skip empty pages
            continue;
          }
          // Extract page icon from the HTML
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

  // Build folder hierarchy from collected paths
  const folderHierarchy =
    pagePathsWithIds.length > 0
      ? buildFolderHierarchy(pagePathsWithIds)
      : undefined;

  return { entryId, pageIds, isWorkspaceFile, hasMarkdown, folderHierarchy };
}

export const NotionHtmlTransformer = {
  importNotionZip,
};
