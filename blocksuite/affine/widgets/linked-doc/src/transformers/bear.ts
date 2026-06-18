import {
  defaultImageProxyMiddleware,
  docLinkBaseURLMiddleware,
  fileNameMiddleware,
  filePathMiddleware,
  MarkdownAdapter,
} from '@blocksuite/affine-shared/adapters';
import { Container } from '@blocksuite/global/di';
import { sha } from '@blocksuite/global/utils';
import type { ExtensionType, Schema, Workspace } from '@blocksuite/store';
import { extMimeMap, Transformer } from '@blocksuite/store';
import JSZip from 'jszip';

import { createCollectionDocCRUD } from './markdown.js';

/** Recursive tree node representing a tag-based folder hierarchy. */
type FolderHierarchy = {
  name: string;
  path: string;
  children: Map<string, FolderHierarchy>;
  pageId?: string;
  parentPath?: string;
};

type BearImportOptions = {
  collection: Workspace;
  schema: Schema;
  imported: Blob;
  extensions: ExtensionType[];
};

type BearImportResult = {
  docIds: string[];
  tags: Map<string, string[]>;
  folderHierarchy: FolderHierarchy;
};

type BundleEntry = {
  bundlePath: string;
  markdownPath: string | null;
  infoJsonPath: string | null;
  assetPaths: string[];
};

/** Create a DI provider from the given extensions. */
function getProvider(extensions: ExtensionType[]) {
  const container = new Container();
  extensions.forEach(ext => {
    ext.setup(container);
  });
  return container.provider();
}

/**
 * Extract Bear tags from the trailing footer of a markdown document.
 * Bear places tags (e.g. `#tag`, `#multi word tag#`, `#nested/tag`) at the end
 * of notes. This scans from the bottom up, collecting tag-only lines (up to 5)
 * and returns the deduplicated tags plus the content with those lines removed.
 */
function parseBearTags(markdown: string): {
  tags: string[];
  content: string;
} {
  const lines = markdown.split('\n');

  const codeFenceState: boolean[] = [];
  let inCodeBlock = false;
  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
    }
    codeFenceState.push(inCodeBlock);
  }

  const tags: string[] = [];
  const tagLineIndices = new Set<number>();

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    if (codeFenceState[i]) break;

    const lineTags = extractTagsFromLine(line);
    if (lineTags.length > 0) {
      for (const tag of lineTags) {
        tags.push(tag);
      }
      tagLineIndices.add(i);
    } else {
      break;
    }

    if (tagLineIndices.size >= 5) break;
  }

  const filteredLines = lines.filter((_, i) => !tagLineIndices.has(i));
  while (
    filteredLines.length > 0 &&
    filteredLines[filteredLines.length - 1].trim() === ''
  ) {
    filteredLines.pop();
  }

  return {
    tags: deduplicateTags(tags),
    content: filteredLines.join('\n'),
  };
}

/**
 * Parse Bear tags from a single line. Supports open tags (`#tag`),
 * closed tags (`#multi word tag#`), and nested tags (`#parent/child`).
 * Returns an empty array if the line contains non-tag content.
 */
function extractTagsFromLine(line: string): string[] {
  const tags: string[] = [];
  let remaining = line;

  while (remaining.length > 0) {
    remaining = remaining.trimStart();
    if (!remaining) break;

    if (remaining.startsWith('[')) return [];

    if (remaining.startsWith('#')) {
      if (remaining.length > 1 && remaining[1] === ' ') return [];
      if (remaining.length > 2 && remaining[1] === '#') return [];

      const closedMatch = remaining.match(/^#([^#\n]+)#/);
      if (closedMatch) {
        const tagValue = closedMatch[1].trim();
        if (tagValue) {
          tags.push(tagValue);
          remaining = remaining.slice(closedMatch[0].length);
          continue;
        }
      }

      const openMatch = remaining.match(
        /^#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)(.*)$/u
      );
      if (openMatch) {
        const tagValue = openMatch[1];
        const after = openMatch[2].trim();
        if (tagValue) {
          tags.push(tagValue);
          remaining = after;
          continue;
        }
      }

      return [];
    } else {
      return [];
    }
  }

  return tags;
}

/**
 * Deduplicate tags case-insensitively while preserving the original
 * capitalization of the first occurrence of each tag.
 */
function deduplicateTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const normalized = tag.toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(tag);
    }
  }
  return result;
}

/**
 * Build a nested folder hierarchy from Bear tags.
 * Tags like `parent/child` create nested folders. Documents are attached
 * as leaf nodes under their tag's folder using `__doc__` prefixed keys.
 */
function buildFolderHierarchyFromTags(
  tagDocMap: Map<string, string[]>
): FolderHierarchy {
  const root: FolderHierarchy = {
    name: '',
    path: '',
    children: new Map(),
  };

  for (const [tag, docIds] of tagDocMap) {
    const parts = tag.split('/');
    let current = root;
    let currentPath = '';

    for (const part of parts) {
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          path: currentPath,
          parentPath: parentPath || undefined,
          children: new Map(),
        });
      }
      current = current.children.get(part)!;
    }

    for (const docId of docIds) {
      const docNodeKey = `__doc__${docId}`;
      if (!current.children.has(docNodeKey)) {
        current.children.set(docNodeKey, {
          name: docNodeKey,
          path: `${current.path}/${docNodeKey}`,
          parentPath: current.path,
          children: new Map(),
          pageId: docId,
        });
      }
    }
  }

  return root;
}

const GFM_CALLOUT_MAP: Record<string, string> = {
  IMPORTANT: '\u26A0',
  NOTE: '\uD83D\uDCDD',
  WARNING: '\u26A0',
  TIP: '\uD83D\uDCA1',
  CAUTION: '\uD83D\uDD34',
};

/**
 * Convert GFM-style callouts (`> [!NOTE]`, `> [!WARNING]`, etc.) to
 * emoji-based callouts that AFFiNE's remark-callout plugin understands.
 * Skips content inside fenced code blocks.
 */
function convertGfmCallouts(markdown: string): string {
  const lines = markdown.split('\n');
  let inCodeBlock = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (!inCodeBlock) {
      lines[i] = lines[i].replace(
        /^(>\s*)\[!(\w+)\]/,
        (_match, prefix: string, type: string) => {
          const emoji = GFM_CALLOUT_MAP[type.toUpperCase()];
          return emoji ? `${prefix}[!${emoji}]` : _match;
        }
      );
    }
  }
  return lines.join('\n');
}

function stripBearMetadataComments(markdown: string): string {
  let current = markdown;
  while (true) {
    const next = current.replace(/<!--\s*\{[^}]*\}\s*-->/g, '');
    if (next === current) {
      return current;
    }
    current = next;
  }
}

const HIGHLIGHT_COLOR_MAP: Record<string, string> = {
  '\uD83D\uDFE2': 'green',
  '\uD83D\uDD35': 'blue',
  '\uD83D\uDFE3': 'purple',
  '\uD83D\uDD34': 'red',
  '\uD83D\uDFE1': 'yellow',
  '\uD83D\uDFE0': 'orange',
};

/** Escape HTML special characters to prevent markup injection. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Convert Bear `==highlight==` syntax to `<mark>` HTML elements.
 * Supports colored highlights via leading color emoji (e.g. `==🟢green text==`).
 * Skips content inside fenced code blocks.
 */
function convertHighlights(markdown: string): string {
  const lines = markdown.split('\n');
  let inCodeBlock = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (!inCodeBlock) {
      lines[i] = lines[i].replace(
        /==(\S(?:[^=]|=[^=])*?)==/g,
        (_match, content: string) => {
          const firstChar = String.fromCodePoint(content.codePointAt(0)!);
          const color = HIGHLIGHT_COLOR_MAP[firstChar];
          if (color) {
            const text = content.slice(firstChar.length);
            return `<mark data-color="${color}">${escapeHtml(text)}</mark>`;
          }
          return `<mark>${escapeHtml(content)}</mark>`;
        }
      );
    }
  }
  return lines.join('\n');
}

/** Extract the document title from the first `# heading` or fall back to the bundle name. */
function extractTitle(markdown: string, bundleName: string): string {
  const lines = markdown.split('\n');
  let inCodeBlock = false;
  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    const match = line.match(/^#\s+(.+)/);
    if (match) {
      const title = match[1].trim();
      if (title) return title;
    }
  }
  return bundleName.replace(/\.textbundle$/i, '') || 'Untitled';
}

/**
 * Import a Bear .bear2bk backup file.
 * Uses JSZip for lazy/streaming decompression to handle large backups.
 */
async function importBearBackup({
  collection,
  schema,
  imported,
  extensions,
}: BearImportOptions): Promise<BearImportResult> {
  const provider = getProvider(extensions);

  // JSZip reads the zip directory without decompressing all entries
  const zip = await JSZip.loadAsync(imported);

  // Scan entries and group by textbundle
  const bundleMap = new Map<string, BundleEntry>();

  zip.forEach((path, _entry) => {
    if (path.includes('__MACOSX') || path.includes('.DS_Store')) return;

    const tbMatch = path.match(/^(.+?\.textbundle)\/(.*)/i);
    if (!tbMatch) return;

    const bundlePath = tbMatch[1];
    const innerPath = tbMatch[2];

    if (!bundleMap.has(bundlePath)) {
      bundleMap.set(bundlePath, {
        bundlePath,
        markdownPath: null,
        infoJsonPath: null,
        assetPaths: [],
      });
    }
    const bundle = bundleMap.get(bundlePath)!;

    if (innerPath === 'text.md' || innerPath === 'text.txt') {
      bundle.markdownPath = path;
    } else if (innerPath === 'info.json') {
      bundle.infoJsonPath = path;
    } else if (innerPath.startsWith('assets/') && innerPath !== 'assets/') {
      bundle.assetPaths.push(path);
    }
  });

  // Read info.json for all bundles to filter out trashed notes
  // (info.json is tiny, safe to read all at once)
  const validBundles: Array<{
    entry: BundleEntry;
    bearMeta: Record<string, unknown> | undefined;
  }> = [];

  for (const entry of bundleMap.values()) {
    if (!entry.markdownPath) continue;

    let info: Record<string, unknown> = {};
    if (entry.infoJsonPath) {
      try {
        const text = await zip.file(entry.infoJsonPath)!.async('string');
        info = JSON.parse(text);
      } catch {
        // Invalid JSON
      }
    }

    const bearMeta = info['net.shinyfrog.bear'] as
      | Record<string, unknown>
      | undefined;
    if (bearMeta?.trashed === 1) continue;

    validBundles.push({ entry, bearMeta });
  }

  if (validBundles.length === 0) {
    throw new Error(
      'No valid Bear textbundles found in the archive. Please select a .bear2bk backup file.'
    );
  }

  const docIds: string[] = [];
  const tagDocMap = new Map<string, string[]>();

  // Process bundles sequentially to limit memory.
  // Each bundle is wrapped in try/catch so one bad note does not abort the
  // entire import after earlier notes have already been written.
  for (const { entry, bearMeta } of validBundles) {
    try {
      // Read markdown (decompress on demand)
      const rawMarkdown = await zip.file(entry.markdownPath!)!.async('string');
      if (!rawMarkdown.trim()) continue;

      const { tags, content: cleanedMarkdown } = parseBearTags(rawMarkdown);
      const bundleDirName =
        entry.bundlePath.split('/').findLast(Boolean) ?? 'Untitled';
      const title = extractTitle(cleanedMarkdown, bundleDirName);
      const markdown = convertHighlights(
        convertGfmCallouts(stripBearMetadataComments(cleanedMarkdown))
      );

      // Read assets on demand (decompress only this bundle's assets)
      const pendingAssets = new Map<string, File>();
      const pendingPathBlobIdMap = new Map<string, string>();

      for (const assetFullPath of entry.assetPaths) {
        try {
          const data = await zip.file(assetFullPath)!.async('arraybuffer');
          const tbMatch = assetFullPath.match(/^.+?\.textbundle\/(.*)/i);
          const assetRelPath = tbMatch ? tbMatch[1] : assetFullPath;
          const ext = assetRelPath.split('.').at(-1) ?? '';
          const mime = extMimeMap.get(ext.toLowerCase()) ?? '';
          const key = await sha(data);
          // Map both the full zip path and the relative path (assets/...)
          pendingPathBlobIdMap.set(assetFullPath, key);
          pendingPathBlobIdMap.set(assetRelPath, key);
          try {
            const decodedRel = decodeURIComponent(assetRelPath);
            if (decodedRel !== assetRelPath) {
              pendingPathBlobIdMap.set(decodedRel, key);
            }
            const decodedFull = decodeURIComponent(assetFullPath);
            if (decodedFull !== assetFullPath) {
              pendingPathBlobIdMap.set(decodedFull, key);
            }
          } catch {
            // Invalid URI encoding
          }
          const fileName = assetRelPath.split('/').pop() ?? '';
          pendingAssets.set(key, new File([data], fileName, { type: mime }));
        } catch {
          // Failed to read asset, skip
        }
      }

      const fullPath = `${entry.bundlePath}/text.md`;
      const job = new Transformer({
        schema,
        blobCRUD: collection.blobSync,
        docCRUD: createCollectionDocCRUD(collection),
        middlewares: [
          defaultImageProxyMiddleware,
          fileNameMiddleware(title),
          filePathMiddleware(fullPath),
          docLinkBaseURLMiddleware(collection.id),
        ],
      });

      const assets = job.assets;
      const pathBlobIdMap = job.assetsManager.getPathBlobIdMap();
      for (const [p, key] of pendingPathBlobIdMap.entries()) {
        pathBlobIdMap.set(p, key);
      }
      for (const [key, file] of pendingAssets.entries()) {
        assets.set(key, file);
      }

      const mdAdapter = new MarkdownAdapter(job, provider);
      const doc = await mdAdapter.toDoc({
        file: markdown,
        assets: job.assetsManager,
      });

      if (doc) {
        docIds.push(doc.id);

        const metaPatch: Record<string, unknown> = {};
        if (bearMeta?.creationDate) {
          const ts = Date.parse(String(bearMeta.creationDate));
          if (!isNaN(ts)) metaPatch.createDate = ts;
        }
        if (bearMeta?.modificationDate) {
          const ts = Date.parse(String(bearMeta.modificationDate));
          if (!isNaN(ts)) metaPatch.updatedDate = ts;
        }
        if (Object.keys(metaPatch).length) {
          collection.meta.setDocMeta(doc.id, metaPatch);
        }

        for (const tag of tags) {
          if (!tagDocMap.has(tag)) {
            tagDocMap.set(tag, []);
          }
          tagDocMap.get(tag)!.push(doc.id);
        }
      }
    } catch (err) {
      console.warn(`Failed to import bundle: ${entry.bundlePath}`, err);
    }
  }

  const folderHierarchy = buildFolderHierarchyFromTags(tagDocMap);
  return { docIds, tags: tagDocMap, folderHierarchy };
}

/** Public API for importing Bear .bear2bk backup archives. */
export const BearTransformer = {
  importBearBackup,
};
