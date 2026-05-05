import {
  Button,
  IconButton,
  type IconData,
  IconType,
  Modal,
} from '@affine/component';
import { getStoreManager } from '@affine/core/blocksuite/manager/store';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import {
  type DialogComponentProps,
  GlobalDialogService,
  type WORKSPACE_DIALOG_SCHEMA,
} from '@affine/core/modules/dialogs';
import { ExplorerIconService } from '@affine/core/modules/explorer-icon/services/explorer-icon';
import { OrganizeService } from '@affine/core/modules/organize';
import { TagService } from '@affine/core/modules/tag';
import { UrlService } from '@affine/core/modules/url';
import {
  getAFFiNEWorkspaceSchema,
  type WorkspaceMetadata,
  WorkspaceService,
} from '@affine/core/modules/workspace';
import { DebugLogger } from '@affine/debug';
import { useI18n } from '@affine/i18n';
import track from '@affine/track';
import { openDirectory, openFilesWith } from '@blocksuite/affine/shared/utils';
import type { Workspace } from '@blocksuite/affine/store';
import {
  BearTransformer,
  DocxTransformer,
  HtmlTransformer,
  MarkdownTransformer,
  NotionHtmlTransformer,
  ObsidianTransformer,
  ZipTransformer,
} from '@blocksuite/affine/widgets/linked-doc';
import {
  ExportToHtmlIcon,
  ExportToMarkdownIcon,
  FileIcon,
  HelpIcon,
  NotionIcon,
  PageIcon,
  SaveIcon,
  ZipIcon,
} from '@blocksuite/icons/rc';
import { useService } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import {
  type ReactElement,
  type SVGAttributes,
  useCallback,
  useMemo,
  useState,
} from 'react';

import * as style from './styles.css';

const logger = new DebugLogger('import');

type NotionPageIcon = {
  type: 'emoji' | 'image';
  content: string; // emoji unicode or image URL/data
};

type FolderHierarchy = {
  name: string;
  path: string;
  children: Map<string, FolderHierarchy>;
  pageId?: string;
  parentPath?: string;
  icon?: NotionPageIcon;
};

// Helper function to create folder structure using OrganizeService
function createFolderStructure(
  organizeService: OrganizeService,
  hierarchy: FolderHierarchy,
  parentFolderId: string | null = null,
  explorerIconService?: ExplorerIconService
): {
  folderId: string | null;
  docLinks: Array<{ folderId: string; docId: string }>;
} {
  const docLinks: Array<{ folderId: string; docId: string }> = [];
  const rootFolder = organizeService.folderTree.rootFolder;

  function processHierarchyNode(
    node: FolderHierarchy,
    currentParentId: string | null
  ): string | null {
    let currentFolderId = currentParentId;

    // If this node represents a folder (has children but no pageId), create it
    if (node.children.size > 0 && !node.pageId && node.name) {
      const parent = currentParentId
        ? organizeService.folderTree.folderNode$(currentParentId).value
        : rootFolder;

      if (parent) {
        const index = parent.indexAt('after');
        currentFolderId = parent.createFolder(node.name, index);
      }
    }

    // Process all children
    for (const child of node.children.values()) {
      if (child.pageId) {
        // This is a document, link it to the current folder
        if (currentFolderId) {
          docLinks.push({ folderId: currentFolderId, docId: child.pageId });
        }

        // Set icon for the document if available
        if (child.icon && explorerIconService) {
          logger.debug('=== Setting icon for document ===');
          logger.debug('Document ID:', child.pageId);
          logger.debug('Icon data:', child.icon);

          try {
            let iconData: IconData | undefined;
            if (child.icon.type === 'emoji') {
              iconData = {
                type: IconType.Emoji,
                unicode: child.icon.content,
              };
              logger.debug('Created emoji icon data:', iconData);
            } else if (child.icon.type === 'image') {
              // For image icons, we'd need to handle blob conversion
              // For now, let's skip image icons or convert them to default
              // This could be enhanced later to download and convert images to blobs
              logger.debug(
                'Skipping image icon (not implemented):',
                child.icon.content
              );
              iconData = undefined;
            }

            if (iconData) {
              logger.debug('Calling explorerIconService.setIcon with:', {
                where: 'doc',
                id: child.pageId,
                icon: iconData,
              });
              explorerIconService.setIcon({
                where: 'doc',
                id: child.pageId,
                icon: iconData,
              });
              logger.debug('Icon set successfully for document:', child.pageId);
            } else {
              logger.debug('No valid icon data to set');
            }
          } catch (error) {
            logger.error(
              'Error setting icon for document:',
              child.pageId,
              error
            );
            logger.warn(
              'Failed to set icon for document:',
              child.pageId,
              error
            );
          }
        } else {
          if (!child.icon) {
            logger.debug('No icon found for document:', child.pageId);
          }
          if (!explorerIconService) {
            logger.debug(
              'ExplorerIconService not available for document:',
              child.pageId
            );
          }
        }
      } else if (child.children.size > 0) {
        // This is a subfolder, process it recursively
        processHierarchyNode(child, currentFolderId);
      }
    }

    return currentFolderId;
  }

  const rootFolderId = processHierarchyNode(hierarchy, parentFolderId);
  return { folderId: rootFolderId, docLinks };
}

/**
 * Creates the folder tree described by {@link folderHierarchy} via
 * {@link OrganizeService} and links every document into its folder.
 * Returns the root folder ID on success, or `undefined` if the
 * hierarchy is empty or an error occurs.
 *
 * When {@link explorerIconService} is provided, document icons from the
 * hierarchy (e.g. Notion page emojis) are applied. Callers that do not
 * need icon support can omit it safely.
 */
function applyFolderHierarchy(
  organizeService: OrganizeService,
  folderHierarchy: FolderHierarchy,
  explorerIconService?: ExplorerIconService
): string | undefined {
  if (folderHierarchy.children.size === 0) return undefined;
  try {
    const { folderId, docLinks } = createFolderStructure(
      organizeService,
      folderHierarchy,
      null,
      explorerIconService
    );
    for (const { folderId, docId } of docLinks) {
      const folder = organizeService.folderTree.folderNode$(folderId).value;
      if (folder) {
        const index = folder.indexAt('after');
        folder.createLink('doc', docId, index);
      }
    }
    return folderId || undefined;
  } catch (error) {
    logger.warn('Failed to create folder structure:', error);
    return undefined;
  }
}

type ImportType =
  | 'markdown'
  | 'markdownZip'
  | 'notion'
  | 'notionMarkdown'
  | 'obsidian'
  | 'bear'
  | 'snapshot'
  | 'html'
  | 'docx'
  | 'dotaffinefile';
type AcceptType = 'Markdown' | 'Zip' | 'Html' | 'Docx' | 'Directory' | 'Skip'; // Skip is used for dotaffinefile
type Status = 'idle' | 'importing' | 'success' | 'error';
type ImportResult = {
  docIds: string[];
  entryId?: string;
  isWorkspaceFile?: boolean;
  rootFolderId?: string;
  importedWorkspace?: WorkspaceMetadata;
};

type ImportedWorkspacePayload = {
  workspace: WorkspaceMetadata;
};

type ImportConfig = {
  fileOptions: { acceptType: AcceptType; multiple: boolean };
  importFunction: (
    docCollection: Workspace,
    files: File[],
    handleImportAffineFile: () => Promise<WorkspaceMetadata | undefined>,
    organizeService?: OrganizeService,
    explorerIconService?: ExplorerIconService,
    tagService?: TagService
  ) => Promise<ImportResult>;
};

const importOptions = [
  {
    key: 'markdown',
    label: 'com.affine.import.markdown-files',
    prefixIcon: (
      <ExportToMarkdownIcon
        color={cssVarV2('icon/primary')}
        width={20}
        height={20}
      />
    ),
    testId: 'editor-option-menu-import-markdown-files',
    type: 'markdown' as ImportType,
  },
  {
    key: 'markdownZip',
    label: 'com.affine.import.markdown-with-media-files',
    prefixIcon: (
      <ZipIcon color={cssVarV2('icon/primary')} width={20} height={20} />
    ),
    suffixIcon: (
      <HelpIcon color={cssVarV2('icon/primary')} width={20} height={20} />
    ),
    suffixTooltip: 'com.affine.import.markdown-with-media-files.tooltip',
    testId: 'editor-option-menu-import-markdown-with-media',
    type: 'markdownZip' as ImportType,
  },
  {
    key: 'html',
    label: 'com.affine.import.html-files',
    prefixIcon: (
      <ExportToHtmlIcon
        color={cssVarV2('icon/primary')}
        width={20}
        height={20}
      />
    ),
    suffixIcon: (
      <HelpIcon color={cssVarV2('icon/primary')} width={20} height={20} />
    ),
    suffixTooltip: 'com.affine.import.html-files.tooltip',
    testId: 'editor-option-menu-import-html',
    type: 'html' as ImportType,
  },
  {
    key: 'notion',
    label: 'com.affine.import.notion',
    prefixIcon: <NotionIcon color={cssVar('black')} width={20} height={20} />,
    suffixIcon: (
      <HelpIcon color={cssVarV2('icon/primary')} width={20} height={20} />
    ),
    suffixTooltip: 'com.affine.import.notion.tooltip',
    testId: 'editor-option-menu-import-notion',
    type: 'notion' as ImportType,
  },
  {
    key: 'notionMarkdown',
    label: 'com.affine.import.notion-markdown',
    prefixIcon: <NotionIcon color={cssVar('black')} width={20} height={20} />,
    suffixIcon: (
      <HelpIcon color={cssVarV2('icon/primary')} width={20} height={20} />
    ),
    suffixTooltip: 'com.affine.import.notion-markdown.tooltip',
    testId: 'editor-option-menu-import-notion-markdown',
    type: 'notionMarkdown' as ImportType,
  },
  {
    key: 'obsidian',
    label: 'com.affine.import.obsidian',
    prefixIcon: (
      <ExportToMarkdownIcon color={cssVar('black')} width={20} height={20} />
    ),
    suffixIcon: (
      <HelpIcon color={cssVarV2('icon/primary')} width={20} height={20} />
    ),
    suffixTooltip: 'com.affine.import.obsidian.tooltip',
    testId: 'editor-option-menu-import-obsidian',
    type: 'obsidian' as ImportType,
  },
  {
    key: 'bear',
    label: 'com.affine.import.bear',
    prefixIcon: (
      <FileIcon color={cssVarV2('icon/primary')} width={20} height={20} />
    ),
    suffixIcon: (
      <HelpIcon color={cssVarV2('icon/primary')} width={20} height={20} />
    ),
    suffixTooltip: 'com.affine.import.bear.tooltip',
    testId: 'editor-option-menu-import-bear',
    type: 'bear' as ImportType,
  },
  {
    key: 'docx',
    label: 'com.affine.import.docx',
    prefixIcon: <FileIcon color={cssVar('black')} width={20} height={20} />,
    suffixIcon: (
      <HelpIcon color={cssVarV2('icon/primary')} width={20} height={20} />
    ),
    suffixTooltip: 'com.affine.import.docx.tooltip',
    testId: 'editor-option-menu-import-docx',
    type: 'docx' as ImportType,
  },
  {
    key: 'snapshot',
    label: 'com.affine.import.snapshot',
    prefixIcon: (
      <PageIcon color={cssVarV2('icon/primary')} width={20} height={20} />
    ),
    suffixIcon: (
      <HelpIcon color={cssVarV2('icon/primary')} width={20} height={20} />
    ),
    suffixTooltip: 'com.affine.import.snapshot.tooltip',
    testId: 'editor-option-menu-import-snapshot',
    type: 'snapshot' as ImportType,
  },
  BUILD_CONFIG.isElectron
    ? {
        key: 'dotaffinefile',
        label: 'com.affine.import.dotaffinefile',
        prefixIcon: (
          <SaveIcon color={cssVarV2('icon/primary')} width={20} height={20} />
        ),
        suffixIcon: (
          <HelpIcon color={cssVarV2('icon/primary')} width={20} height={20} />
        ),
        suffixTooltip: 'com.affine.import.dotaffinefile.tooltip',
        testId: 'editor-option-menu-import-dotaffinefile',
        type: 'dotaffinefile' as ImportType,
      }
    : null,
].filter(v => v !== null);

const importConfigs: Record<ImportType, ImportConfig> = {
  markdown: {
    fileOptions: { acceptType: 'Markdown', multiple: true },
    importFunction: async (
      docCollection,
      files,
      _handleImportAffineFile,
      _organizeService,
      _explorerIconService
    ) => {
      const docIds: string[] = [];
      for (const file of files) {
        const text = await file.text();
        const fileName = file.name.split('.').slice(0, -1).join('.');
        const docId = await MarkdownTransformer.importMarkdownToDoc({
          collection: docCollection,
          schema: getAFFiNEWorkspaceSchema(),
          markdown: text,
          fileName,
          extensions: getStoreManager().config.init().value.get('store'),
        });
        if (docId) docIds.push(docId);
      }
      return {
        docIds,
      };
    },
  },
  markdownZip: {
    fileOptions: { acceptType: 'Zip', multiple: false },
    importFunction: async (
      docCollection,
      files,
      _handleImportAffineFile,
      organizeService,
      _explorerIconService
    ) => {
      const file = files.length === 1 ? files[0] : null;
      if (!file) {
        throw new Error('Expected a single zip file for markdownZip import');
      }
      const { docIds, folderHierarchy } =
        await MarkdownTransformer.importMarkdownZip({
          collection: docCollection,
          schema: getAFFiNEWorkspaceSchema(),
          imported: file,
          extensions: getStoreManager().config.init().value.get('store'),
        });

      const rootFolderId =
        folderHierarchy && organizeService
          ? applyFolderHierarchy(organizeService, folderHierarchy)
          : undefined;

      return {
        docIds,
        rootFolderId,
      };
    },
  },
  html: {
    fileOptions: { acceptType: 'Html', multiple: true },
    importFunction: async (
      docCollection,
      files,
      _handleImportAffineFile,
      _organizeService,
      _explorerIconService
    ) => {
      const docIds: string[] = [];
      for (const file of files) {
        const text = await file.text();
        const fileName = file.name.split('.').slice(0, -1).join('.');
        const docId = await HtmlTransformer.importHTMLToDoc({
          collection: docCollection,
          schema: getAFFiNEWorkspaceSchema(),
          extensions: getStoreManager().config.init().value.get('store'),
          html: text,
          fileName,
        });
        if (docId) docIds.push(docId);
      }
      return {
        docIds,
      };
    },
  },
  notion: {
    fileOptions: { acceptType: 'Zip', multiple: false },
    importFunction: async (
      docCollection,
      files,
      _handleImportAffineFile,
      organizeService,
      explorerIconService
    ) => {
      const file = files.length === 1 ? files[0] : null;
      if (!file) {
        throw new Error('Expected a single zip file for notion import');
      }
      const { entryId, pageIds, isWorkspaceFile, folderHierarchy } =
        await NotionHtmlTransformer.importNotionZip({
          collection: docCollection,
          schema: getAFFiNEWorkspaceSchema(),
          imported: file,
          extensions: getStoreManager().config.init().value.get('store'),
        });

      const rootFolderId =
        folderHierarchy && organizeService
          ? applyFolderHierarchy(
              organizeService,
              folderHierarchy,
              explorerIconService
            )
          : undefined;

      return {
        docIds: pageIds,
        entryId,
        isWorkspaceFile,
        rootFolderId,
      };
    },
  },
  notionMarkdown: {
    fileOptions: { acceptType: 'Zip', multiple: false },
    importFunction: async (
      docCollection,
      files,
      _handleImportAffineFile,
      organizeService,
      explorerIconService
    ) => {
      const file = files.length === 1 ? files[0] : null;
      if (!file) {
        throw new Error('Expected a single zip file for notionMarkdown import');
      }
      const { docIds, folderHierarchy } =
        await MarkdownTransformer.importNotionMarkdownZip({
          collection: docCollection,
          schema: getAFFiNEWorkspaceSchema(),
          imported: file,
          extensions: getStoreManager().config.init().value.get('store'),
        });

      const rootFolderId =
        folderHierarchy && organizeService
          ? applyFolderHierarchy(
              organizeService,
              folderHierarchy,
              explorerIconService
            )
          : undefined;

      return {
        docIds,
        rootFolderId,
      };
    },
  },
  obsidian: {
    fileOptions: { acceptType: 'Directory', multiple: false },
    importFunction: async (
      docCollection,
      files,
      _handleImportAffineFile,
      _organizeService,
      explorerIconService
    ) => {
      const { docIds, docEmojis } =
        await ObsidianTransformer.importObsidianVault({
          collection: docCollection,
          schema: getAFFiNEWorkspaceSchema(),
          importedFiles: files,
          extensions: getStoreManager().config.init().value.get('store'),
        });

      if (explorerIconService) {
        for (const [id, emoji] of docEmojis.entries()) {
          explorerIconService.setIcon({
            where: 'doc',
            id,
            icon: { type: IconType.Emoji, unicode: emoji },
          });
        }
      }

      return { docIds };
    },
  },
  bear: {
    fileOptions: { acceptType: 'Zip', multiple: false },
    importFunction: async (
      docCollection,
      files,
      _handleImportAffineFile,
      organizeService,
      _explorerIconService,
      tagService
    ) => {
      const file = files.length === 1 ? files[0] : null;
      if (!file) {
        throw new Error('Expected a single .bear2bk file for Bear import');
      }
      let docIds: string[];
      let tags: Map<string, string[]>;
      let folderHierarchy: FolderHierarchy;
      try {
        const result = await BearTransformer.importBearBackup({
          collection: docCollection,
          schema: getAFFiNEWorkspaceSchema(),
          imported: file,
          extensions: getStoreManager().config.init().value.get('store'),
        });
        docIds = result.docIds;
        tags = result.tags;
        folderHierarchy = result.folderHierarchy;
      } catch (err) {
        logger.error('Bear import failed:', err);
        throw err instanceof Error
          ? err
          : new Error(String(err) || 'Bear import failed');
      }

      // Create AFFiNE tags from Bear tags
      if (tagService && tags.size > 0) {
        try {
          // Get existing tags for deduplication
          const existingTags = tagService.tagList.tags$.value;
          const existingTagMap = new Map<string, string>(); // lowercase name → tag id
          for (const tag of existingTags) {
            const name = tag.value$.value.toLowerCase();
            existingTagMap.set(name, tag.id);
          }

          // Consolidate tags by root segment (e.g., "privat/bike" → "privat").
          // Keyed by lowercase root for case-insensitive dedup, but the
          // original capitalization of the first occurrence is preserved
          // so new AFFiNE tags are created with the user's casing.
          const rootTagDocMap = new Map<
            string,
            { displayName: string; docs: Set<string> }
          >();
          for (const [tagName, tagDocIds] of tags) {
            const originalRoot = tagName.split('/')[0];
            const key = originalRoot.toLowerCase();
            let entry = rootTagDocMap.get(key);
            if (!entry) {
              entry = { displayName: originalRoot, docs: new Set<string>() };
              rootTagDocMap.set(key, entry);
            }
            for (const docId of tagDocIds) {
              entry.docs.add(docId);
            }
          }

          for (const [
            rootTagKey,
            { displayName, docs: docIdSet },
          ] of rootTagDocMap) {
            // Check if tag already exists (case-insensitive)
            let tagId = existingTagMap.get(rootTagKey);
            if (!tagId) {
              const newTag = tagService.tagList.createTag(
                displayName,
                tagService.randomTagColor()
              );
              tagId = newTag.id;
              existingTagMap.set(rootTagKey, tagId);
            }

            // Assign tag to each doc
            for (const docId of docIdSet) {
              const doc = docCollection.getDoc(docId);
              const currentTags = doc?.meta?.tags ?? [];
              if (!currentTags.includes(tagId)) {
                docCollection.meta.setDocMeta(docId, {
                  tags: [...currentTags, tagId],
                });
              }
            }
          }
        } catch (error) {
          logger.warn('Failed to create Bear tags:', error);
        }
      }

      const rootFolderId =
        folderHierarchy && organizeService
          ? applyFolderHierarchy(organizeService, folderHierarchy)
          : undefined;

      return {
        docIds,
        rootFolderId,
      };
    },
  },
  docx: {
    fileOptions: { acceptType: 'Docx', multiple: false },
    importFunction: async (docCollection, file) => {
      const files = Array.isArray(file) ? file : [file];
      const docIds: string[] = [];
      for (const file of files) {
        const docId = await DocxTransformer.importDocx({
          collection: docCollection,
          schema: getAFFiNEWorkspaceSchema(),
          imported: file,
          extensions: getStoreManager().config.init().value.get('store'),
        });
        if (docId) docIds.push(docId);
      }
      return { docIds };
    },
  },
  snapshot: {
    fileOptions: { acceptType: 'Zip', multiple: false },
    importFunction: async (
      docCollection,
      files,
      _handleImportAffineFile,
      _organizeService,
      _explorerIconService
    ) => {
      const file = files.length === 1 ? files[0] : null;
      if (!file) {
        throw new Error('Expected a single zip file for snapshot import');
      }
      const docIds = (
        await ZipTransformer.importDocs(
          docCollection,
          getAFFiNEWorkspaceSchema(),
          file
        )
      )
        .filter((doc): doc is NonNullable<typeof doc> => doc !== undefined)
        .map(doc => doc.id);

      return {
        docIds,
      };
    },
  },
  dotaffinefile: {
    fileOptions: { acceptType: 'Skip', multiple: false },
    importFunction: async (
      _,
      __,
      handleImportAffineFile,
      _organizeService,
      _explorerIconService
    ) => {
      const workspace = await handleImportAffineFile();
      return {
        docIds: [],
        entryId: undefined,
        isWorkspaceFile: true,
        importedWorkspace: workspace,
      };
    },
  },
};

const ImportOptionItem = ({
  label,
  prefixIcon,
  suffixIcon,
  suffixTooltip,
  type,
  onImport,
  ...props
}: {
  label: string;
  prefixIcon: ReactElement<SVGAttributes<SVGElement>>;
  suffixIcon?: ReactElement<SVGAttributes<SVGElement>>;
  suffixTooltip?: string;
  type: ImportType;
  onImport: (type: ImportType) => void;
}) => {
  const t = useI18n();
  return (
    <div className={style.importItem} onClick={() => onImport(type)} {...props}>
      {prefixIcon}
      <div className={style.importItemLabel}>{t[label]()}</div>
      {suffixIcon && (
        <IconButton
          className={style.importItemSuffix}
          icon={suffixIcon}
          tooltip={suffixTooltip ? t[suffixTooltip]() : undefined}
        />
      )}
    </div>
  );
};

const ImportOptions = ({
  onImport,
}: {
  onImport: (type: ImportType) => void;
}) => {
  const t = useI18n();

  return (
    <>
      <div className={style.importModalTitle}>{t['Import']()}</div>
      <div className={style.importModalContent}>
        {importOptions.map(
          ({
            key,
            label,
            prefixIcon,
            suffixIcon,
            suffixTooltip,
            testId,
            type,
          }) => (
            <ImportOptionItem
              key={key}
              prefixIcon={prefixIcon}
              suffixIcon={suffixIcon}
              suffixTooltip={suffixTooltip}
              label={label}
              type={type}
              onImport={onImport}
              data-testid={testId}
            />
          )
        )}
      </div>
      <div className={style.importModalTip}>
        {t['com.affine.import.modal.tip']()}{' '}
        <a
          className={style.link}
          href={BUILD_CONFIG.discordUrl}
          target="_blank"
          rel="noreferrer"
        >
          Discord
        </a>
        .
      </div>
    </>
  );
};

const ImportingStatus = () => {
  const t = useI18n();
  return (
    <>
      <div className={style.importModalTitle}>
        {t['com.affine.import.status.importing.title']()}
      </div>
      <p className={style.importStatusContent}>
        {t['com.affine.import.status.importing.message']()}
      </p>
    </>
  );
};

const SuccessStatus = ({ onComplete }: { onComplete: () => void }) => {
  const t = useI18n();
  return (
    <>
      <div className={style.importModalTitle}>
        {t['com.affine.import.status.success.title']()}
      </div>
      <p className={style.importStatusContent}>
        {t['com.affine.import.status.success.message']()}{' '}
        <a
          className={style.link}
          href={BUILD_CONFIG.discordUrl}
          target="_blank"
          rel="noreferrer"
        >
          Discord
        </a>
        .
      </p>
      <div className={style.importModalButtonContainer}>
        <Button onClick={onComplete} variant="primary">
          {t['Complete']()}
        </Button>
      </div>
    </>
  );
};

const ErrorStatus = ({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) => {
  const t = useI18n();
  const urlService = useService(UrlService);
  return (
    <>
      <div className={style.importModalTitle}>
        {t['com.affine.import.status.failed.title']()}
      </div>
      <p className={style.importStatusContent}>
        {error || 'Unknown error occurred'}
      </p>
      <div className={style.importModalButtonContainer}>
        <Button
          onClick={() => {
            urlService.openPopupWindow(BUILD_CONFIG.discordUrl);
          }}
          variant="secondary"
        >
          {t['Feedback']()}
        </Button>
        <Button onClick={onRetry} variant="primary">
          {t['Retry']()}
        </Button>
      </div>
    </>
  );
};

export const ImportDialog = ({
  close,
}: DialogComponentProps<WORKSPACE_DIALOG_SCHEMA['import']>) => {
  const t = useI18n();
  const [status, setStatus] = useState<Status>('idle');
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const workspace = useService(WorkspaceService).workspace;
  const docCollection = workspace.docCollection;
  const organizeService = useService(OrganizeService);
  const explorerIconService = useService(ExplorerIconService);
  const tagService = useService(TagService);

  const globalDialogService = useService(GlobalDialogService);

  const { jumpToPage } = useNavigateHelper();
  const handleCreatedWorkspace = useCallback(
    (payload: { metadata: WorkspaceMetadata; defaultDocId?: string }) => {
      if (document.startViewTransition) {
        document.startViewTransition(() => {
          if (payload.defaultDocId) {
            jumpToPage(payload.metadata.id, payload.defaultDocId);
          } else {
            jumpToPage(payload.metadata.id, 'all');
          }
          return new Promise(resolve =>
            setTimeout(resolve, 150)
          ); /* start transition after 150ms */
        });
      } else {
        if (payload.defaultDocId) {
          jumpToPage(payload.metadata.id, payload.defaultDocId);
        } else {
          jumpToPage(payload.metadata.id, 'all');
        }
      }
    },
    [jumpToPage]
  );

  const handleImportAffineFile = useMemo(() => {
    return async () => {
      track.$.navigationPanel.workspaceList.createWorkspace({
        control: 'import',
      });

      return new Promise<WorkspaceMetadata | undefined>((resolve, reject) => {
        globalDialogService.open(
          'import-workspace',
          undefined,
          (payload?: ImportedWorkspacePayload) => {
            if (payload) {
              resolve(payload.workspace);
            } else {
              reject(new Error('No workspace imported'));
            }
          }
        );
      });
    };
  }, [globalDialogService]);

  const handleImport = useAsyncCallback(
    async (type: ImportType) => {
      setImportError(null);
      try {
        const importConfig = importConfigs[type];
        const { acceptType, multiple } = importConfig.fileOptions;

        const files =
          acceptType === 'Skip'
            ? []
            : acceptType === 'Directory'
              ? await openDirectory()
              : await openFilesWith(acceptType, multiple);

        if (!files || (files.length === 0 && acceptType !== 'Skip')) {
          throw new Error(
            t['com.affine.import.status.failed.message.no-file-selected']()
          );
        }

        if (acceptType !== 'Skip') {
          setStatus('importing');
          track.$.importModal.$.import({
            type,
            status: 'importing',
          });
        }

        const {
          docIds,
          entryId,
          isWorkspaceFile,
          rootFolderId,
          importedWorkspace,
        } = await importConfig.importFunction(
          docCollection,
          files,
          handleImportAffineFile,
          organizeService,
          explorerIconService,
          tagService
        );

        setImportResult({
          docIds,
          entryId,
          isWorkspaceFile,
          rootFolderId,
          importedWorkspace,
        });
        setStatus('success');
        track.$.importModal.$.import({
          type,
          status: 'success',
          result: {
            docCount: docIds.length,
          },
        });
        track.$.importModal.$.createDoc({
          control: 'import',
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';
        setImportError(errorMessage);
        setStatus('error');
        track.$.importModal.$.import({
          type,
          status: 'failed',
          error: errorMessage || undefined,
        });
        logger.error('Failed to import', error);
      }
    },
    [
      docCollection,
      explorerIconService,
      handleImportAffineFile,
      organizeService,
      tagService,
      t,
    ]
  );

  const finishImport = useCallback(() => {
    if (importResult?.importedWorkspace) {
      handleCreatedWorkspace({ metadata: importResult.importedWorkspace });
    }
    if (!importResult) {
      close();
      return;
    }
    const { importedWorkspace: _workspace, ...result } = importResult;
    close(result);
  }, [close, handleCreatedWorkspace, importResult]);

  const handleComplete = useCallback(() => {
    finishImport();
  }, [finishImport]);

  const handleRetry = () => {
    setStatus('idle');
  };

  const statusComponents = {
    idle: <ImportOptions onImport={handleImport} />,
    importing: <ImportingStatus />,
    success: <SuccessStatus onComplete={handleComplete} />,
    error: <ErrorStatus error={importError} onRetry={handleRetry} />,
  };

  return (
    <Modal
      open
      onOpenChange={(open: boolean) => {
        if (!open) {
          finishImport();
        }
      }}
      width={480}
      contentOptions={{
        ['data-testid' as string]: 'import-modal',
        style: {
          maxHeight: '85vh',
          maxWidth: '70vw',
          minHeight: '126px',
          padding: 0,
          overflow: 'hidden',
          display: 'flex',
          background: cssVarV2('layer/background/primary'),
        },
      }}
      closeButtonOptions={{
        className: style.closeButton,
      }}
      withoutCloseButton={status === 'importing'}
      persistent={status === 'importing'}
    >
      <div className={style.importModalContainer} data-testid="import-dialog">
        {statusComponents[status]}
      </div>
    </Modal>
  );
};
