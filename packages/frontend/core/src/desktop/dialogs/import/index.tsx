import { Button, IconButton, Modal } from '@affine/component';
import { getStoreManager } from '@affine/core/blocksuite/manager/store';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import {
  type DialogComponentProps,
  GlobalDialogService,
  type WORKSPACE_DIALOG_SCHEMA,
} from '@affine/core/modules/dialogs';
import { UrlService } from '@affine/core/modules/url';
import {
  getAFFiNEWorkspaceSchema,
  type WorkspaceMetadata,
  WorkspaceService,
} from '@affine/core/modules/workspace';
import { DebugLogger } from '@affine/debug';
import { useI18n } from '@affine/i18n';
import track from '@affine/track';
import { openFilesWith } from '@blocksuite/affine/shared/utils';
import type { Workspace } from '@blocksuite/affine/store';
import {
  HtmlTransformer,
  MarkdownTransformer,
  NotionHtmlTransformer,
  ZipTransformer,
} from '@blocksuite/affine/widgets/linked-doc';
import {
  ExportToHtmlIcon,
  ExportToMarkdownIcon,
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

type ImportType =
  | 'markdown'
  | 'markdownZip'
  | 'notion'
  | 'snapshot'
  | 'html'
  | 'dotaffinefile';
type AcceptType = 'Markdown' | 'Zip' | 'Html' | 'Skip'; // Skip is used for dotaffinefile
type Status = 'idle' | 'importing' | 'success' | 'error';
type ImportResult = {
  docIds: string[];
  entryId?: string;
  isWorkspaceFile?: boolean;
};

type ImportConfig = {
  fileOptions: { acceptType: AcceptType; multiple: boolean };
  importFunction: (
    docCollection: Workspace,
    files: File[],
    handleImportAffineFile: () => Promise<WorkspaceMetadata | undefined>
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
    importFunction: async (docCollection, files) => {
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
    importFunction: async (docCollection, files) => {
      const file = files.length === 1 ? files[0] : null;
      if (!file) {
        throw new Error('Expected a single zip file for markdownZip import');
      }
      const docIds = await MarkdownTransformer.importMarkdownZip({
        collection: docCollection,
        schema: getAFFiNEWorkspaceSchema(),
        imported: file,
        extensions: getStoreManager().config.init().value.get('store'),
      });
      return {
        docIds,
      };
    },
  },
  html: {
    fileOptions: { acceptType: 'Html', multiple: true },
    importFunction: async (docCollection, files) => {
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
    importFunction: async (docCollection, files) => {
      const file = files.length === 1 ? files[0] : null;
      if (!file) {
        throw new Error('Expected a single zip file for notion import');
      }
      const { entryId, pageIds, isWorkspaceFile } =
        await NotionHtmlTransformer.importNotionZip({
          collection: docCollection,
          schema: getAFFiNEWorkspaceSchema(),
          imported: file,
          extensions: getStoreManager().config.init().value.get('store'),
        });
      return {
        docIds: pageIds,
        entryId,
        isWorkspaceFile,
      };
    },
  },
  snapshot: {
    fileOptions: { acceptType: 'Zip', multiple: false },
    importFunction: async (docCollection, files) => {
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
        .filter(doc => doc !== undefined)
        .map(doc => doc.id);

      return {
        docIds,
      };
    },
  },
  dotaffinefile: {
    fileOptions: { acceptType: 'Skip', multiple: false },
    importFunction: async (_, __, handleImportAffineFile) => {
      await handleImportAffineFile();
      return {
        docIds: [],
        entryId: undefined,
        isWorkspaceFile: true,
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
        globalDialogService.open('import-workspace', undefined, payload => {
          if (payload) {
            handleCreatedWorkspace({ metadata: payload.workspace });
            resolve(payload.workspace);
          } else {
            reject(new Error('No workspace imported'));
          }
        });
      });
    };
  }, [globalDialogService, handleCreatedWorkspace]);

  const handleImport = useAsyncCallback(
    async (type: ImportType) => {
      setImportError(null);
      try {
        const importConfig = importConfigs[type];
        const { acceptType, multiple } = importConfig.fileOptions;

        const files =
          acceptType === 'Skip'
            ? []
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

        const { docIds, entryId, isWorkspaceFile } =
          await importConfig.importFunction(
            docCollection,
            files,
            handleImportAffineFile
          );

        setImportResult({ docIds, entryId, isWorkspaceFile });
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
    [docCollection, handleImportAffineFile, t]
  );

  const handleComplete = useCallback(() => {
    close(importResult || undefined);
  }, [importResult, close]);

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
          close(importResult || undefined);
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
