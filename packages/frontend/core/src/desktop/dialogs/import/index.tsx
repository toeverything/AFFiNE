import { Button, IconButton, Modal } from '@affine/component';
import { getStoreManager } from '@affine/core/blocksuite/manager/store';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import {
  type DialogComponentProps,
  GlobalDialogService,
  type WORKSPACE_DIALOG_SCHEMA,
} from '@affine/core/modules/dialogs';
import {
  type ImportRunContext,
  ImportService,
} from '@affine/core/modules/import';
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
  DocxTransformer,
  HtmlTransformer,
  type ImportWarning,
  MarkdownTransformer,
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
  useRef,
  useState,
} from 'react';

import * as style from './styles.css';

const logger = new DebugLogger('import');

function shouldSnapshotPickedFiles(type: ImportType, acceptType: AcceptType) {
  if (acceptType === 'Directory' || acceptType === 'Skip') return false;
  return !['markdownZip', 'notion', 'bear', 'oneNote'].includes(type);
}

type ImportType =
  | 'markdown'
  | 'markdownZip'
  | 'notion'
  | 'obsidian'
  | 'bear'
  | 'oneNote'
  | 'snapshot'
  | 'html'
  | 'docx'
  | 'dotaffinefile';
type AcceptType =
  | 'Markdown'
  | 'Zip'
  | 'Html'
  | 'Docx'
  | 'OneNote'
  | 'Directory'
  | 'Skip'; // Skip is used for dotaffinefile
type Status = 'idle' | 'importing' | 'success' | 'error';
type ImportErrorState = {
  code: string;
  message: string;
  sourcePath?: string;
};
type ImportResult = {
  docIds: string[];
  entryId?: string;
  isWorkspaceFile?: boolean;
  rootFolderId?: string;
  importedWorkspace?: WorkspaceMetadata;
  warnings?: ImportWarning[];
};

type ImportedWorkspacePayload = {
  workspace: WorkspaceMetadata;
};

type ImportFunctionArgs = {
  docCollection: Workspace;
  files: File[];
  importAffineFile: () => Promise<WorkspaceMetadata | undefined>;
  importService?: ImportService;
  context: ImportRunContext;
};

function toImportErrorState(error: unknown): ImportErrorState {
  const sourcePath =
    typeof error === 'object' &&
    error !== null &&
    'sourcePath' in error &&
    typeof error.sourcePath === 'string'
      ? error.sourcePath
      : undefined;
  if (error instanceof DOMException && error.name === 'AbortError') {
    return {
      code: 'cancelled',
      message: 'Import cancelled',
      sourcePath,
    };
  }
  if (error instanceof Error) {
    return {
      code: error.name || 'import-error',
      message: error.message || 'Unknown error occurred',
      sourcePath,
    };
  }
  return {
    code: 'unknown',
    message: 'Unknown error occurred',
    sourcePath,
  };
}

function requireImportService(importService?: ImportService) {
  if (!importService) {
    throw new Error('Import service is unavailable');
  }
  return importService;
}

type ImportConfig = {
  fileOptions: { acceptType: AcceptType; multiple: boolean };
  nativeOnly?: boolean;
  importFunction: (args: ImportFunctionArgs) => Promise<ImportResult>;
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
    key: 'oneNote',
    label: 'com.affine.import.onenote',
    prefixIcon: (
      <FileIcon color={cssVarV2('icon/primary')} width={20} height={20} />
    ),
    suffixIcon: (
      <HelpIcon color={cssVarV2('icon/primary')} width={20} height={20} />
    ),
    suffixTooltip: 'com.affine.import.onenote.tooltip',
    testId: 'editor-option-menu-import-onenote',
    type: 'oneNote' as ImportType,
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
    importFunction: async ({ docCollection, files }) => {
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
    importFunction: async ({ files, importService, context }) => {
      const file = files.length === 1 ? files[0] : null;
      if (!file) {
        throw new Error('Expected a single zip file for markdownZip import');
      }
      return requireImportService(importService).importMarkdownZip(
        file,
        context
      );
    },
  },
  html: {
    fileOptions: { acceptType: 'Html', multiple: true },
    importFunction: async ({ docCollection, files }) => {
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
    importFunction: async ({ files, importService, context }) => {
      const file = files.length === 1 ? files[0] : null;
      if (!file) {
        throw new Error('Expected a single zip file for notion import');
      }
      return requireImportService(importService).importNotionZip(file, context);
    },
  },
  obsidian: {
    fileOptions: { acceptType: 'Directory', multiple: false },
    importFunction: async ({ files, importService, context }) => {
      return requireImportService(importService).importObsidianVault(
        files,
        context
      );
    },
  },
  bear: {
    fileOptions: { acceptType: 'Zip', multiple: false },
    importFunction: async ({ files, importService, context }) => {
      const file = files.length === 1 ? files[0] : null;
      if (!file) {
        throw new Error('Expected a single .bear2bk file for Bear import');
      }
      return requireImportService(importService).importBearBackup(
        file,
        context
      );
    },
  },
  oneNote: {
    fileOptions: { acceptType: 'OneNote', multiple: false },
    nativeOnly: true,
    importFunction: async ({ files, importService, context }) => {
      const file = files.length === 1 ? files[0] : null;
      if (!file) {
        throw new Error('Expected a single OneNote file');
      }
      return requireImportService(importService).importOneNote(file, context);
    },
  },
  docx: {
    fileOptions: { acceptType: 'Docx', multiple: false },
    importFunction: async ({ docCollection, files }) => {
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
    importFunction: async ({ docCollection, files }) => {
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
    importFunction: async ({ importAffineFile }) => {
      const workspace = await importAffineFile();
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
  disabled,
  ...props
}: {
  label: string;
  prefixIcon: ReactElement<SVGAttributes<SVGElement>>;
  suffixIcon?: ReactElement<SVGAttributes<SVGElement>>;
  suffixTooltip?: string;
  type: ImportType;
  onImport: (type: ImportType) => void;
  disabled?: boolean;
}) => {
  const t = useI18n();
  return (
    <div
      className={disabled ? style.importItemDisabled : style.importItem}
      onClick={() => onImport(type)}
      aria-disabled={disabled}
      {...props}
    >
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
          }) => {
            const disabled = Boolean(
              importConfigs[type].nativeOnly && !BUILD_CONFIG.isElectron
            );
            return (
              <ImportOptionItem
                key={key}
                prefixIcon={prefixIcon}
                suffixIcon={suffixIcon}
                suffixTooltip={suffixTooltip}
                label={label}
                type={type}
                onImport={onImport}
                disabled={disabled}
                data-testid={testId}
              />
            );
          }
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

const ImportingStatus = ({
  progress,
  onCancel,
}: {
  progress: { completed: number; total: number } | null;
  onCancel: () => void;
}) => {
  const t = useI18n();
  const progressLabel =
    progress && progress.total > 0
      ? `${progress.completed}/${progress.total}`
      : null;
  return (
    <>
      <div className={style.importModalTitle}>
        {t['com.affine.import.status.importing.title']()}
      </div>
      <p className={style.importStatusContent}>
        {t['com.affine.import.status.importing.message']()}
      </p>
      {progressLabel ? (
        <div className={style.importProgress}>{progressLabel}</div>
      ) : null}
      <div className={style.importModalButtonContainer}>
        <Button onClick={onCancel} variant="secondary">
          {t['Cancel']()}
        </Button>
      </div>
    </>
  );
};

const SuccessStatus = ({
  warnings,
  onComplete,
}: {
  warnings: string[];
  onComplete: () => void;
}) => {
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
      {warnings.length ? (
        <div className={style.importWarnings}>
          {warnings.map((warning, index) => (
            <div key={`${warning}-${index}`}>{warning}</div>
          ))}
        </div>
      ) : null}
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
  error: ImportErrorState | null;
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
        {error?.message || 'Unknown error occurred'}
      </p>
      {error?.sourcePath ? (
        <div className={style.importErrorDetail}>{error.sourcePath}</div>
      ) : null}
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
  const [importError, setImportError] = useState<ImportErrorState | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importProgress, setImportProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const importAbortControllerRef = useRef<AbortController | null>(null);
  const workspace = useService(WorkspaceService).workspace;
  const docCollection = workspace.docCollection;
  const importService = useService(ImportService);

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
      setImportProgress(null);
      try {
        const importConfig = importConfigs[type];
        if (importConfig.nativeOnly && !BUILD_CONFIG.isElectron) {
          throw new Error(t['com.affine.import.onenote.desktop-only']());
        }
        const { acceptType, multiple } = importConfig.fileOptions;

        const files =
          acceptType === 'Skip'
            ? []
            : acceptType === 'Directory'
              ? await openDirectory({
                  fileSystemAccess: false,
                })
              : await openFilesWith(acceptType, multiple, {
                  fileSystemAccess: false,
                  snapshot: shouldSnapshotPickedFiles(type, acceptType),
                });

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

        const abortController = new AbortController();
        importAbortControllerRef.current = abortController;
        const {
          docIds,
          entryId,
          isWorkspaceFile,
          rootFolderId,
          importedWorkspace,
          warnings,
        } = await importConfig.importFunction({
          docCollection,
          files,
          importAffineFile: handleImportAffineFile,
          importService,
          context: {
            signal: abortController.signal,
            onProgress: progress => {
              setImportProgress(progress);
            },
          },
        });
        importAbortControllerRef.current = null;

        setImportResult({
          docIds,
          entryId,
          isWorkspaceFile,
          rootFolderId,
          importedWorkspace,
          warnings,
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
        importAbortControllerRef.current = null;
        const structuredError = toImportErrorState(error);
        setImportError(structuredError);
        setStatus('error');
        track.$.importModal.$.import({
          type,
          status: 'failed',
          error: structuredError.message || undefined,
        });
        logger.error('Failed to import', error);
      }
    },
    [docCollection, handleImportAffineFile, importService, t]
  );

  const finishImport = useCallback(() => {
    if (importResult?.importedWorkspace) {
      handleCreatedWorkspace({ metadata: importResult.importedWorkspace });
    }
    if (!importResult) {
      close();
      return;
    }
    close({
      docIds: importResult.docIds,
      entryId: importResult.entryId,
      isWorkspaceFile: importResult.isWorkspaceFile,
    });
  }, [close, handleCreatedWorkspace, importResult]);

  const handleComplete = useCallback(() => {
    finishImport();
  }, [finishImport]);

  const handleRetry = () => {
    setImportProgress(null);
    setStatus('idle');
  };

  const handleCancel = useCallback(() => {
    importAbortControllerRef.current?.abort();
  }, []);

  const statusComponents = {
    idle: <ImportOptions onImport={handleImport} />,
    importing: (
      <ImportingStatus progress={importProgress} onCancel={handleCancel} />
    ),
    success: (
      <SuccessStatus
        warnings={(importResult?.warnings ?? []).map(warning =>
          typeof warning === 'string' ? warning : warning.message
        )}
        onComplete={handleComplete}
      />
    ),
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
