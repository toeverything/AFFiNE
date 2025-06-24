import { Button } from '@affine/component';
import { AuthHeader } from '@affine/component/auth-components';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { useWorkspaceName } from '@affine/core/components/hooks/use-workspace-info';
import { WorkspaceSelector } from '@affine/core/components/workspace-selector';
import { AuthService, ServerService } from '@affine/core/modules/cloud';
import {
  type ClipperInput,
  ImportClipperService,
} from '@affine/core/modules/import-clipper';
import {
  type WorkspaceMetadata,
  WorkspacesService,
} from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import track from '@affine/track';
import { AllDocsIcon } from '@blocksuite/icons/rc';
import { LiveData, useLiveData, useService } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import { useCallback, useEffect, useRef, useState } from 'react';

import * as styles from './style.css';

const clipperInput$ = new LiveData<ClipperInput | null>(null);
const port$ = new LiveData<MessagePort | null>(null);

window.addEventListener('message', event => {
  if (
    typeof event.data === 'object' &&
    event.data.type === 'affine-clipper:import'
  ) {
    clipperInput$.value = event.data.payload;

    if (event.ports.length > 0) {
      port$.value = event.ports[0];
    }
  }
});

export const Component = () => {
  const importClipperService = useService(ImportClipperService);
  const t = useI18n();
  const session = useService(AuthService).session;
  const notLogin = useLiveData(session.status$) === 'unauthenticated';

  const [importing, setImporting] = useState(false);
  const [importingError, setImportingError] = useState<any>(null);
  const clipperInput = useLiveData(clipperInput$);
  const [clipperInputSnapshot, setClipperInputSnapshot] =
    useState<ClipperInput | null>(null);
  const isMissingInput = !clipperInputSnapshot;
  const workspaceStrategy = clipperInputSnapshot?.workspace ?? 'select-by-user';
  const serverService = useService(ServerService);
  const workspacesService = useService(WorkspacesService);
  const serverConfig = useLiveData(serverService.server.config$);
  const workspaces = useLiveData(workspacesService.list.workspaces$);
  const [rawSelectedWorkspace, setSelectedWorkspace] =
    useState<WorkspaceMetadata | null>(null);
  const [lastOpenedWorkspaceId] = useState(() =>
    localStorage.getItem('last_workspace_id')
  );
  const selectedWorkspace =
    rawSelectedWorkspace ??
    workspaces.find(w => w.id === lastOpenedWorkspaceId) ??
    workspaces.find(w => w.flavour !== 'local') ??
    workspaces.at(0);
  const selectedWorkspaceName = useWorkspaceName(selectedWorkspace);

  const noWorkspace = workspaces.length === 0;

  useEffect(() => {
    workspacesService.list.revalidate();
  }, [workspacesService]);

  useEffect(() => {
    session.revalidate();
  }, [session]);

  useEffect(() => {
    if (!clipperInputSnapshot) {
      setClipperInputSnapshot(clipperInput);
    }
  }, [clipperInput, clipperInputSnapshot]);

  const handleSelectedWorkspace = useCallback(
    (workspaceMetadata: WorkspaceMetadata) => {
      return setSelectedWorkspace(workspaceMetadata);
    },
    []
  );

  const handleCreatedWorkspace = useCallback(
    (payload: { metadata: WorkspaceMetadata; defaultDocId?: string }) => {
      return setSelectedWorkspace(payload.metadata);
    },
    []
  );

  const handleSuccess = useCallback(() => {
    const arg = { type: 'affine-clipper:import:success' };
    const port = port$.value;
    track.clipper.$.$.createDoc();
    if (port) {
      port.postMessage(arg);
    } else {
      window.postMessage(arg);
    }
    window.close();
  }, []);

  const handleImportToSelectedWorkspace = useAsyncCallback(async () => {
    if (clipperInputSnapshot && selectedWorkspace) {
      // save the last opened workspace id
      localStorage.setItem('last_workspace_id', selectedWorkspace.id);
      setImporting(true);
      try {
        await importClipperService.importToWorkspace(
          selectedWorkspace,
          clipperInputSnapshot
        );
        handleSuccess();
      } catch (err) {
        setImportingError(err);
      } finally {
        setImporting(false);
      }
    }
  }, [
    clipperInputSnapshot,
    handleSuccess,
    importClipperService,
    selectedWorkspace,
  ]);

  const handleImportToNewWorkspace = useAsyncCallback(async () => {
    if (!clipperInputSnapshot) {
      return;
    }
    setImporting(true);
    try {
      await importClipperService.importToNewWorkspace(
        'affine-cloud',
        'Workspace',
        clipperInputSnapshot
      );
      handleSuccess();
    } catch (err) {
      setImportingError(err);
    } finally {
      setImporting(false);
    }
  }, [clipperInputSnapshot, handleSuccess, importClipperService]);

  const handleClickSignIn = useCallback(() => {
    window.open(
      `/sign-in?redirect_uri=${encodeURIComponent('CLOSE_POPUP')}`,
      '_blank',
      'popup'
    );
  }, []);

  const autoImportTriggered = useRef(false);

  useEffect(() => {
    if (isMissingInput) {
      return;
    }
    // use ref to avoid multiple auto import
    // and make sure the following code only runs once
    if (autoImportTriggered.current) {
      return;
    }
    autoImportTriggered.current = true;

    // if not login, we don't auto import
    if (notLogin) {
      return;
    }

    // if the workspace strategy is last-open-workspace, we automatically click the import button
    if (
      workspaceStrategy === 'last-open-workspace' &&
      selectedWorkspace?.id === lastOpenedWorkspaceId
    ) {
      handleImportToSelectedWorkspace();
    }
  }, [
    workspaceStrategy,
    selectedWorkspace,
    handleImportToSelectedWorkspace,
    lastOpenedWorkspaceId,
    isMissingInput,
    notLogin,
  ]);

  const disabled = isMissingInput || importing || notLogin;

  if (notLogin) {
    // not login
    return (
      <div className={styles.container}>
        <AuthHeader
          className={styles.authHeader}
          title={t['com.affine.auth.sign.in']()}
          subTitle={serverConfig.serverName}
        />
        <Button
          className={styles.mainButton}
          variant="primary"
          onClick={handleClickSignIn}
        >
          {t['com.affine.auth.sign.in']()}
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <AllDocsIcon className={styles.mainIcon} />
      <h6 className={styles.mainTitle}>
        {t['com.affine.import-clipper.dialog.createDocFromClipper']()}
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
            menuContentOptions={{
              side: 'top',
              style: {
                maxHeight: 'min(600px, calc(50vh + 50px))',
                width: 352,
                maxWidth: 'calc(100vw - 20px)',
              },
            }}
          />
        </>
      )}
      <div className={styles.buttonContainer}>
        {importingError && (
          <span style={{ color: cssVar('warningColor') }}>
            {t['com.affine.import-clipper.dialog.errorImport']()}
          </span>
        )}
        {isMissingInput ? (
          <span style={{ color: cssVar('warningColor') }}>
            {t['com.affine.import-clipper.dialog.errorLoad']()}
          </span>
        ) : selectedWorkspace ? (
          <Button
            className={styles.mainButton}
            variant={disabled ? 'secondary' : 'primary'}
            loading={disabled}
            disabled={disabled}
            onClick={handleImportToSelectedWorkspace}
            data-testid="import-clipper-to-workspace-btn"
          >
            {selectedWorkspaceName &&
              t['com.affine.import-clipper.dialog.createDocToWorkspace']({
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
            {t['com.affine.import-clipper.dialog.createDocToNewWorkspace']()}
          </Button>
        )}
      </div>
    </div>
  );
};
