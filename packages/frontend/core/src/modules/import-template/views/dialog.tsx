import { Button, Modal } from '@affine/component';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import { useWorkspaceName } from '@affine/core/components/hooks/use-workspace-info';
import { WorkspaceSelector } from '@affine/core/components/workspace-selector';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useI18n } from '@affine/i18n';
import { AllDocsIcon } from '@blocksuite/icons/rc';
import {
  useLiveData,
  useService,
  type WorkspaceMetadata,
  WorkspacesService,
} from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import { useCallback, useEffect, useState } from 'react';

import { AuthService } from '../../cloud';
import type { CreateWorkspaceCallbackPayload } from '../../create-workspace';
import { ImportTemplateDialogService } from '../services/dialog';
import { TemplateDownloaderService } from '../services/downloader';
import { ImportTemplateService } from '../services/import';
import * as styles from './dialog.css';

const Dialog = ({
  templateName,
  snapshotUrl,
  onClose,
}: {
  templateName: string;
  snapshotUrl: string;
  onClose?: () => void;
}) => {
  const t = useI18n();
  const session = useService(AuthService).session;
  const notLogin = useLiveData(session.status$) === 'unauthenticated';
  const isSessionRevalidating = useLiveData(session.isRevalidating$);

  const [importing, setImporting] = useState(false);
  const [importingError, setImportingError] = useState<any>(null);
  const workspacesService = useService(WorkspacesService);
  const templateDownloaderService = useService(TemplateDownloaderService);
  const importTemplateService = useService(ImportTemplateService);
  const templateDownloader = templateDownloaderService.downloader;
  const isDownloading = useLiveData(templateDownloader.isDownloading$);
  const downloadError = useLiveData(templateDownloader.error$);
  const workspaces = useLiveData(workspacesService.list.workspaces$);
  const [rawSelectedWorkspace, setSelectedWorkspace] =
    useState<WorkspaceMetadata | null>(null);
  const selectedWorkspace =
    rawSelectedWorkspace ??
    workspaces.find(w => w.flavour === WorkspaceFlavour.AFFINE_CLOUD) ??
    workspaces.at(0);
  const selectedWorkspaceName = useWorkspaceName(selectedWorkspace);
  const { openPage, jumpToSignIn } = useNavigateHelper();

  const noWorkspace = workspaces.length === 0;

  useEffect(() => {
    workspacesService.list.revalidate();
  }, [workspacesService]);

  useEffect(() => {
    session.revalidate();
  }, [session]);

  useEffect(() => {
    if (!isSessionRevalidating && notLogin) {
      jumpToSignIn(
        '/template/import?' +
          '&name=' +
          templateName +
          '&snapshotUrl=' +
          snapshotUrl
      );
      onClose?.();
    }
  }, [
    isSessionRevalidating,
    jumpToSignIn,
    notLogin,
    onClose,
    snapshotUrl,
    templateName,
  ]);

  useEffect(() => {
    templateDownloader.download({ snapshotUrl });
  }, [snapshotUrl, templateDownloader]);

  const handleSelectedWorkspace = useCallback(
    (workspaceMetadata: WorkspaceMetadata) => {
      return setSelectedWorkspace(workspaceMetadata);
    },
    []
  );

  const handleCreatedWorkspace = useCallback(
    (payload: CreateWorkspaceCallbackPayload) => {
      return setSelectedWorkspace(payload.meta);
    },
    []
  );

  const handleImportToSelectedWorkspace = useAsyncCallback(async () => {
    if (templateDownloader.data$.value && selectedWorkspace) {
      setImporting(true);
      try {
        const docId = await importTemplateService.importToWorkspace(
          selectedWorkspace,
          templateDownloader.data$.value
        );
        openPage(selectedWorkspace.id, docId);
        onClose?.();
      } catch (err) {
        setImportingError(err);
      } finally {
        setImporting(false);
      }
    }
  }, [
    importTemplateService,
    onClose,
    openPage,
    selectedWorkspace,
    templateDownloader.data$.value,
  ]);

  const handleImportToNewWorkspace = useAsyncCallback(async () => {
    if (!templateDownloader.data$.value) {
      return;
    }
    setImporting(true);
    try {
      const { workspaceId, docId } =
        await importTemplateService.importToNewWorkspace(
          WorkspaceFlavour.AFFINE_CLOUD,
          'Workspace',
          templateDownloader.data$.value
        );
      openPage(workspaceId, docId);
      onClose?.();
    } catch (err) {
      setImportingError(err);
    } finally {
      setImporting(false);
    }
  }, [
    importTemplateService,
    onClose,
    openPage,
    templateDownloader.data$.value,
  ]);

  const disabled = isDownloading || importing || notLogin;

  return (
    <>
      <div className={styles.dialogContainer}>
        <AllDocsIcon className={styles.mainIcon} />
        <h6 className={styles.mainTitle}>
          {t['com.affine.import-template.dialog.createDocWithTemplate']({
            templateName,
          })}
        </h6>
        {noWorkspace ? (
          <p className={styles.desc}>A new workspace will be created.</p>
        ) : (
          <>
            <p className={styles.desc}>Choose a workspace.</p>
            <WorkspaceSelector
              workspaceMetadata={selectedWorkspace}
              onSelectWorkspace={handleSelectedWorkspace}
              onCreatedWorkspace={handleCreatedWorkspace}
              className={styles.workspaceSelector}
              showArrowDownIcon
              disable={disabled}
            />
          </>
        )}
      </div>
      {importingError && (
        <span style={{ color: cssVar('warningColor') }}>
          {t['com.affine.import-template.dialog.errorImport']()}
        </span>
      )}
      {downloadError ? (
        <span style={{ color: cssVar('warningColor') }}>
          {t['com.affine.import-template.dialog.errorLoad']()}
        </span>
      ) : selectedWorkspace ? (
        <Button
          className={styles.mainButton}
          variant={disabled ? 'secondary' : 'primary'}
          loading={disabled}
          disabled={disabled}
          onClick={handleImportToSelectedWorkspace}
        >
          {selectedWorkspaceName &&
            t['com.affine.import-template.dialog.createDocToWorkspace']({
              workspace: selectedWorkspaceName,
            })}
        </Button>
      ) : (
        <Button
          className={styles.mainButton}
          variant="primary"
          loading={disabled}
          disabled={disabled}
          onClick={handleImportToNewWorkspace}
        >
          {t['com.affine.import-template.dialog.createDocToNewWorkspace']()}
        </Button>
      )}
    </>
  );
};

export const ImportTemplateDialogProvider = () => {
  const importTemplateDialogService = useService(ImportTemplateDialogService);
  const isOpen = useLiveData(importTemplateDialogService.dialog.isOpen$);
  const template = useLiveData(importTemplateDialogService.dialog.template$);

  return (
    <Modal
      open={isOpen}
      modal={true}
      persistent
      withoutCloseButton
      contentOptions={{
        className: styles.modal,
      }}
      onOpenChange={() => importTemplateDialogService.dialog.close()}
    >
      {template && (
        <Dialog
          templateName={template.templateName}
          snapshotUrl={template.snapshotUrl}
          onClose={() => importTemplateDialogService.dialog.close()}
        />
      )}
    </Modal>
  );
};
