import type { IconData } from '@affine/component';
import type { ExplorerIconService } from '@affine/core/modules/explorer-icon/services/explorer-icon';
import type { OrganizeService } from '@affine/core/modules/organize';
import type { TagService } from '@affine/core/modules/tag';
import {
  type ExtensionType,
  type Schema,
  Transformer,
  type Workspace,
} from '@blocksuite/affine/store';
import type {
  ImportBatch,
  ImportCommitResult,
  ImportFolder,
  ImportIconData,
} from '@blocksuite/affine/widgets/linked-doc';

type Logger = {
  warn: (message: string, ...args: unknown[]) => void;
};

type CommitServiceOptions = {
  collection: Workspace;
  schema: Schema;
  extensions: ExtensionType[];
  organizeService?: OrganizeService;
  explorerIconService?: ExplorerIconService;
  tagService?: TagService;
  logger: Logger;
};

type EmojiIconData = Extract<IconData, { unicode: string }>;
const EMOJI_ICON_TYPE = 'emoji' as EmojiIconData['type'];

function copyToArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export class ImportCommitService {
  private readonly folderIdByPath = new Map<string, string>();
  private readonly linkedDocsByFolder = new Set<string>();
  private readonly pendingFolders: ImportFolder[] = [];

  constructor(private readonly options: CommitServiceOptions) {}

  async commitBatch(batch: ImportBatch): Promise<ImportCommitResult> {
    for (const blob of batch.blobs) {
      const bytes = new Uint8Array(blob.bytes);
      await this.options.collection.blobSync.set(
        blob.blobId,
        new File([copyToArrayBuffer(bytes)], blob.fileName, {
          type: blob.mime,
        })
      );
    }

    const transformer = new Transformer({
      schema: this.options.schema,
      blobCRUD: this.options.collection.blobSync,
      docCRUD: {
        create: (id: string) =>
          this.options.collection.createDoc(id).getStore({ id }),
        get: (id: string) =>
          this.options.collection.getDoc(id)?.getStore({ id }) ?? null,
        delete: (id: string) => this.options.collection.removeDoc(id),
      },
      middlewares: [],
    });

    const docIds: string[] = [];
    const tags = new Map<string, string[]>();
    for (const doc of batch.docs) {
      const store = await transformer.snapshotToDoc(doc.snapshot);
      if (!store) continue;
      docIds.push(store.id);
      if (doc.meta && Object.keys(doc.meta).length) {
        const { tags: docTags, ...meta } = doc.meta;
        if (Object.keys(meta).length) {
          this.options.collection.meta.setDocMeta(store.id, meta);
        }
        for (const tag of docTags ?? []) {
          const docIds = tags.get(tag) ?? [];
          docIds.push(store.id);
          tags.set(tag, docIds);
        }
      }
    }
    for (const tag of batch.tags ?? []) {
      const docIds = tags.get(tag.name) ?? [];
      docIds.push(...tag.docIds);
      tags.set(tag.name, docIds);
    }

    const rootFolderId = this.applyNativeFolders(batch.folders ?? []);
    this.applyNativeTags(tags);
    this.applyNativeIcons(batch.icons);
    return {
      docIds,
      entryId: batch.entryId,
      isWorkspaceFile: batch.isWorkspaceFile,
      rootFolderId,
      warnings: batch.warnings ?? [],
    };
  }

  private applyNativeFolders(folders: ImportFolder[]): string | undefined {
    const { organizeService } = this.options;
    if (!organizeService || folders.length === 0) return undefined;

    try {
      let rootFolderId: string | undefined;
      this.pendingFolders.push(...folders);
      let progressed = true;

      while (progressed && this.pendingFolders.length) {
        progressed = false;
        const nextPending: ImportFolder[] = [];
        const pending = this.pendingFolders.splice(0);
        const childParentPaths = new Set(
          pending
            .map(folder => folder.parentPath)
            .filter((path): path is string => !!path)
        );
        for (const folder of pending) {
          const needsContainer =
            !folder.pageId || childParentPaths.has(folder.path);
          if (needsContainer && !this.folderIdByPath.has(folder.path)) {
            const parent = folder.parentPath
              ? this.folderIdByPath.has(folder.parentPath)
                ? organizeService.folderTree.folderNode$(
                    this.folderIdByPath.get(folder.parentPath) ?? ''
                  ).value
                : null
              : organizeService.folderTree.rootFolder;
            if (!parent) {
              nextPending.push(folder);
              continue;
            }
            const folderId = parent.createFolder(
              folder.name,
              parent.indexAt('after')
            );
            this.folderIdByPath.set(folder.path, folderId);
            rootFolderId ??= folderId;
            progressed = true;
          } else if (needsContainer) {
            rootFolderId ??= this.folderIdByPath.get(folder.path);
          }

          if (folder.pageId) {
            if (!this.applyFolderDocLink(folder)) {
              nextPending.push(folder);
              continue;
            }
            progressed = true;
          }
        }
        if (progressed && nextPending.length) {
          this.pendingFolders.push(...nextPending);
        } else {
          this.pendingFolders.push(...nextPending);
          break;
        }
      }

      return rootFolderId;
    } catch (error) {
      this.options.logger.warn('Failed to commit import folders:', error);
      return undefined;
    }
  }

  private applyFolderDocLink(folder: ImportFolder): boolean {
    const { organizeService } = this.options;
    if (!organizeService || !folder.pageId || !folder.parentPath) return true;
    const parentFolderId = this.folderIdByPath.get(folder.parentPath);
    if (!parentFolderId) return false;
    const linkKey = `${parentFolderId}:${folder.pageId}`;
    if (!this.linkedDocsByFolder.has(linkKey)) {
      const parent =
        organizeService.folderTree.folderNode$(parentFolderId).value;
      if (!parent) return false;
      parent.createLink('doc', folder.pageId, parent.indexAt('after'));
      this.linkedDocsByFolder.add(linkKey);
    }
    this.applyIcon(folder.pageId, folder.icon);
    return true;
  }

  private applyNativeIcons(icons?: ImportBatch['icons']) {
    for (const icon of icons ?? []) {
      this.applyIcon(icon.docId, icon.icon);
    }
  }

  private applyIcon(id: string, icon?: ImportIconData) {
    if (!icon || !this.options.explorerIconService) return;
    const iconData = toIconData(icon);
    if (!iconData) return;
    this.options.explorerIconService.setIcon({
      where: 'doc',
      id,
      icon: iconData,
    });
  }

  private applyNativeTags(tags?: Map<string, string[]>) {
    const { tagService, collection } = this.options;
    if (!tagService || !tags?.size) return;

    try {
      const existingTagMap = new Map<string, string>();
      for (const tag of tagService.tagList.tags$.value) {
        existingTagMap.set(tag.value$.value.toLowerCase(), tag.id);
      }

      const rootTagDocMap = new Map<
        string,
        { displayName: string; docs: Set<string> }
      >();
      for (const [tagName, tagDocIds] of tags) {
        const originalRoot = tagName.split('/')[0];
        const key = originalRoot.toLowerCase();
        let entry = rootTagDocMap.get(key);
        if (!entry) {
          entry = { displayName: originalRoot, docs: new Set() };
          rootTagDocMap.set(key, entry);
        }
        for (const docId of tagDocIds) {
          entry.docs.add(docId);
        }
      }

      for (const [rootTagKey, { displayName, docs }] of rootTagDocMap) {
        let tagId = existingTagMap.get(rootTagKey);
        if (!tagId) {
          const newTag = tagService.tagList.createTag(
            displayName,
            tagService.randomTagColor()
          );
          tagId = newTag.id;
          existingTagMap.set(rootTagKey, tagId);
        }

        for (const docId of docs) {
          const doc = collection.getDoc(docId);
          const currentTags = doc?.meta?.tags ?? [];
          if (!currentTags.includes(tagId)) {
            collection.meta.setDocMeta(docId, {
              tags: [...currentTags, tagId],
            });
          }
        }
      }
    } catch (error) {
      this.options.logger.warn('Failed to commit import tags:', error);
    }
  }
}

function toIconData(icon: ImportIconData): IconData | undefined {
  if (icon.type === 'emoji') {
    return {
      type: EMOJI_ICON_TYPE,
      unicode: icon.unicode,
    };
  }
  return undefined;
}
