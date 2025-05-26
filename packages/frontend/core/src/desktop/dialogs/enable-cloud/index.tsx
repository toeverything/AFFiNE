import { Button, Modal, notify } from '@affine/component';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import { ServerSelector } from '@affine/core/components/server-selector';
import {
  AuthService,
  type Server,
  ServersService,
} from '@affine/core/modules/cloud';
import {
  type DialogComponentProps,
  type GLOBAL_DIALOG_SCHEMA,
  GlobalDialogService,
} from '@affine/core/modules/dialogs';
import { WorkspacesService } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import { CloudWorkspaceIcon } from '@blocksuite/icons/rc';
import { FrameworkScope, useLiveData, useService } from '@toeverything/infra';
import { useCallback, useState } from 'react';

import * as styles from './dialog.css';

const Dialog = ({
  workspaceId,
  close,
  selectedServer,
  setSelectedServer,
  serverList,
  openPageId,
}: {
  workspaceId: string;
  serverList: Server[];
  selectedServer: Server;
  setSelectedServer: (server: Server) => void;
  openPageId?: string;
  serverId?: string;
  close?: () => void;
}) => {
  const t = useI18n();
  const authService = useService(AuthService);
  const account = useLiveData(authService.session.account$);
  const loginStatus = useLiveData(useService(AuthService).session.status$);
  const globalDialogService = useService(GlobalDialogService);
  const workspacesService = useService(WorkspacesService);
  const workspaceMeta = useLiveData(
    workspacesService.list.workspace$(workspaceId)
  );
  const { workspace } = workspaceMeta
    ? workspacesService.open({ metadata: workspaceMeta })
    : { workspace: undefined };

  const { jumpToPage, jumpToAll } = useNavigateHelper();

  const enableCloud = useCallback(async () => {
    try {
      if (!workspace) return;
      if (!account) return;

      const { id: newId } = await workspacesService.transformLocalToCloud(
        workspace,
        account.id,
        selectedServer.id
      );
      if (openPageId) {
        jumpToPage(newId, openPageId);
      } else {
        jumpToAll(newId);
      }
      close?.();
    } catch (e) {
      console.error(e);
      notify.error({
        title: t['com.affine.workspace.enable-cloud.failed'](),
      });
    }
  }, [
    workspace,
    account,
    workspacesService,
    selectedServer.id,
    openPageId,
    close,
    jumpToPage,
    jumpToAll,
    t,
  ]);

  const openSignIn = useCallback(() => {
    globalDialogService.open('sign-in', {
      server: selectedServer.baseUrl,
    });
  }, [globalDialogService, selectedServer.baseUrl]);

  const signInOrEnableCloud = useAsyncCallback(async () => {
    // not logged in, open login modal
    if (loginStatus === 'unauthenticated') {
      openSignIn();
    }

    if (loginStatus === 'authenticated') {
      await enableCloud();
    }
  }, [enableCloud, loginStatus, openSignIn]);
  return (
    <div className={styles.root}>
      <CloudWorkspaceIcon width={'36px'} height={'36px'} />
      <div className={styles.textContainer}>
        <div className={styles.title}>
          {t['com.affine.enableAffineCloudModal.custom-server.title']({
            workspaceName: workspace?.name$.value || 'untitled',
          })}
        </div>
        <div className={styles.description}>
          {t['com.affine.enableAffineCloudModal.custom-server.description']()}
        </div>
      </div>
      <div className={styles.serverSelector}>
        <ServerSelector
          servers={serverList}
          selectedSeverName={`${selectedServer.config$.value.serverName} (${selectedServer.baseUrl})`}
          onSelect={setSelectedServer}
        />
      </div>

      <Button
        className={styles.button}
        onClick={signInOrEnableCloud}
        size="extraLarge"
        variant="primary"
      >
        {t['com.affine.enableAffineCloudModal.custom-server.enable']()}
      </Button>
    </div>
  );
};

export const EnableCloudDialog = ({
  workspaceId,
  openPageId,
  serverId,
  close,
}: DialogComponentProps<GLOBAL_DIALOG_SCHEMA['enable-cloud']>) => {
  const serversService = useService(ServersService);
  const serverList = useLiveData(serversService.servers$);
  const [selectedServer, setSelectedServer] = useState<Server>(serverList[0]);

  return (
    <Modal
      open
      modal={true}
      persistent
      contentOptions={{
        className: styles.modal,
      }}
      onOpenChange={() => close()}
    >
      <FrameworkScope key={selectedServer.id} scope={selectedServer.scope}>
        <Dialog
          workspaceId={workspaceId}
          openPageId={openPageId}
          serverId={serverId}
          close={close}
          serverList={serverList}
          selectedServer={selectedServer}
          setSelectedServer={setSelectedServer}
        />
      </FrameworkScope>
    </Modal>
  );
};
