import { Divider, IconButton, Menu, MenuItem } from '@affine/component';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import { useWorkspaceInfo } from '@affine/core/components/hooks/use-workspace-info';
import { WorkspaceAvatar } from '@affine/core/components/workspace-avatar';
import {
  type AuthAccountInfo,
  AuthService,
  type Server,
  ServersService,
} from '@affine/core/modules/cloud';
import { GlobalDialogService } from '@affine/core/modules/dialogs';
import { GlobalContextService } from '@affine/core/modules/global-context';
import {
  type WorkspaceMetadata,
  WorkspacesService,
} from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import {
  AccountIcon,
  CloseIcon,
  CollaborationIcon,
  DeleteIcon,
  MoreHorizontalIcon,
  SelfhostIcon,
  SignOutIcon,
} from '@blocksuite/icons/rc';
import { FrameworkScope, useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import { type HTMLAttributes, useCallback, useMemo } from 'react';

import * as styles from './menu.css';

const WorkspaceItem = ({
  workspace,
  className,
  ...attrs
}: { workspace: WorkspaceMetadata } & HTMLAttributes<HTMLButtonElement>) => {
  const info = useWorkspaceInfo(workspace);
  const name = info?.name;
  const isOwner = info?.isOwner;

  return (
    <li className={styles.wsItem}>
      <button className={clsx(styles.wsCard, className)} {...attrs}>
        <WorkspaceAvatar
          key={workspace.id}
          meta={workspace}
          rounded={6}
          data-testid="workspace-avatar"
          size={32}
          name={name}
          colorfulFallback
        />
        <div className={styles.wsName}>{name}</div>
        {!isOwner ? <CollaborationIcon fontSize={24} /> : null}
      </button>
    </li>
  );
};

interface WorkspaceListProps {
  items: WorkspaceMetadata[];
  onClick: (workspace: WorkspaceMetadata) => void;
  onSettingClick?: (workspace: WorkspaceMetadata) => void;
  onEnableCloudClick?: (meta: WorkspaceMetadata) => void;
}
export const WorkspaceList = (props: WorkspaceListProps) => {
  const workspaceList = props.items;

  return workspaceList.map(item => (
    <WorkspaceItem
      key={item.id}
      workspace={item}
      onClick={() => props.onClick(item)}
    />
  ));
};

const CloudSignIn = ({ onClick }: { onClick: () => void }) => {
  const t = useI18n();
  return (
    <li className={styles.wsItem}>
      <button className={styles.wsCard} onClick={onClick}>
        <div className={styles.signInIcon}>
          <AccountIcon />
        </div>
        <div className={styles.wsName}>{t['Sign in']()}</div>
      </button>
    </li>
  );
};

const WorkspaceServerInfo = ({
  server,
  name,
  account,
  accountStatus,
  onDeleteServer,
  onSignOut,
}: {
  server: string;
  name: string;
  account?: AuthAccountInfo | null;
  accountStatus?: 'authenticated' | 'unauthenticated';
  onDeleteServer?: () => void;
  onSignOut?: () => void;
}) => {
  const t = useI18n();
  const isCloud = server !== 'local';

  const menuItems = useMemo(
    () =>
      [
        server !== 'affine-cloud' && server !== 'local' && (
          <MenuItem
            prefixIcon={<DeleteIcon />}
            type="danger"
            key="delete-server"
            onClick={onDeleteServer}
          >
            {t['com.affine.server.delete']()}
          </MenuItem>
        ),
        accountStatus === 'authenticated' && (
          <MenuItem
            prefixIcon={<SignOutIcon />}
            key="sign-out"
            onClick={onSignOut}
            type="danger"
          >
            {t['Sign out']()}
          </MenuItem>
        ),
      ].filter(Boolean),
    [accountStatus, onDeleteServer, onSignOut, server, t]
  );

  return (
    <div className={styles.serverInfo}>
      <div className={styles.serverName}>{name}</div>
      {isCloud ? (
        <div className={styles.serverAccount}>
          - {account ? account.email : 'Not signed in'}
        </div>
      ) : null}
      <div className={styles.spaceX} />
      {menuItems.length ? (
        <Menu items={menuItems}>
          <IconButton icon={<MoreHorizontalIcon />} />
        </Menu>
      ) : null}
    </div>
  );
};

const LocalWorkspaces = ({
  workspaces,
  onClickWorkspace,
  onClickWorkspaceSetting,
  onClickEnableCloud,
}: {
  workspaces: WorkspaceMetadata[];
  onClickWorkspace: (workspaceMetadata: WorkspaceMetadata) => void;
  onClickWorkspaceSetting?: (workspaceMetadata: WorkspaceMetadata) => void;
  onClickEnableCloud?: (meta: WorkspaceMetadata) => void;
}) => {
  const t = useI18n();
  if (workspaces.length === 0) {
    return null;
  }
  return (
    <>
      <WorkspaceServerInfo
        server="local"
        name={t['com.affine.workspaceList.workspaceListType.local']()}
      />
      <WorkspaceList
        items={workspaces}
        onClick={onClickWorkspace}
        onSettingClick={onClickWorkspaceSetting}
        onEnableCloudClick={onClickEnableCloud}
      />
    </>
  );
};

const CloudWorkSpaceList = ({
  server,
  workspaces,
  onClickWorkspace,
  onClickEnableCloud,
}: {
  server: Server;
  workspaces: WorkspaceMetadata[];
  onClickWorkspace: (workspaceMetadata: WorkspaceMetadata) => void;
  onClickEnableCloud?: (meta: WorkspaceMetadata) => void;
}) => {
  const globalContextService = useService(GlobalContextService);
  const globalDialogService = useService(GlobalDialogService);
  const serverName = useLiveData(server.config$.selector(c => c.serverName));
  const authService = useService(AuthService);
  const serversService = useService(ServersService);
  const account = useLiveData(authService.session.account$);
  const accountStatus = useLiveData(authService.session.status$);
  const navigateHelper = useNavigateHelper();

  const currentWorkspaceFlavour = useLiveData(
    globalContextService.globalContext.workspaceFlavour.$
  );

  const handleDeleteServer = useCallback(() => {
    serversService.removeServer(server.id);

    if (currentWorkspaceFlavour === server.id) {
      const otherWorkspace = workspaces.find(w => w.flavour !== server.id);
      if (otherWorkspace) {
        navigateHelper.openPage(otherWorkspace.id, 'all');
      }
    }
  }, [
    currentWorkspaceFlavour,
    navigateHelper,
    server.id,
    serversService,
    workspaces,
  ]);

  const handleSignOut = useAsyncCallback(async () => {
    await authService.signOut();
    navigateHelper.jumpToSignIn();
  }, [authService, navigateHelper]);

  const handleSignIn = useAsyncCallback(async () => {
    globalDialogService.open('sign-in', {
      server: server.baseUrl,
    });
  }, [globalDialogService, server.baseUrl]);

  return (
    <>
      <WorkspaceServerInfo
        server={server.id}
        name={serverName}
        account={account}
        accountStatus={accountStatus}
        onDeleteServer={handleDeleteServer}
        onSignOut={handleSignOut}
      />
      {accountStatus === 'unauthenticated' ? (
        <CloudSignIn onClick={handleSignIn} />
      ) : (
        <WorkspaceList
          items={workspaces}
          onClick={onClickWorkspace}
          onEnableCloudClick={onClickEnableCloud}
        />
      )}
    </>
  );
};

const AddServer = () => {
  const globalDialogService = useService(GlobalDialogService);

  const onAddServer = useCallback(() => {
    globalDialogService.open('sign-in', { step: 'addSelfhosted' });
  }, [globalDialogService]);

  if (!BUILD_CONFIG.isNative) {
    return null;
  }

  return <IconButton onClick={onAddServer} size="24" icon={<SelfhostIcon />} />;
};

export const SelectorMenu = ({ onClose }: { onClose?: () => void }) => {
  const workspacesService = useService(WorkspacesService);
  const workspaces = useLiveData(workspacesService.list.workspaces$);
  const serversService = useService(ServersService);
  const { jumpToPage } = useNavigateHelper();

  const servers = useLiveData(serversService.servers$);
  const affineCloudServer = useMemo(
    () => servers.find(s => s.id === 'affine-cloud') as Server,
    [servers]
  );
  const selfhostServers = useMemo(
    () => servers.filter(s => s.id !== 'affine-cloud'),
    [servers]
  );

  const cloudWorkspaces = useMemo(
    () =>
      workspaces.filter(
        ({ flavour }) => flavour !== 'local'
      ) as WorkspaceMetadata[],
    [workspaces]
  );

  const localWorkspaces = useMemo(
    () =>
      workspaces.filter(
        ({ flavour }) => flavour === 'local'
      ) as WorkspaceMetadata[],
    [workspaces]
  );

  const handleClickWorkspace = useCallback(
    (workspaceMetadata: WorkspaceMetadata) => {
      const id = workspaceMetadata.id;
      if (id !== currentWorkspace?.id) {
        jumpToPage(id, 'home');
      }
      onClose?.();
    },
    [onClose, jumpToPage]
  );

  return (
    <div className={styles.root}>
      <header className={styles.head}>
        Workspace
        <div className={styles.headActions}>
          <AddServer />
          <IconButton onClick={onClose} size="24" icon={<CloseIcon />} />
        </div>
      </header>
      <div className={styles.divider} />
      <main className={styles.body}>
        {/* 1. affine-cloud  */}
        <FrameworkScope
          key={affineCloudServer.id}
          scope={affineCloudServer.scope}
        >
          <CloudWorkSpaceList
            server={affineCloudServer}
            workspaces={cloudWorkspaces.filter(
              ({ flavour }) => flavour === affineCloudServer.id
            )}
            onClickWorkspace={handleClickWorkspace}
          />
        </FrameworkScope>
        {(localWorkspaces.length > 0 || selfhostServers.length > 0) && (
          <Divider size="thinner" />
        )}
        <LocalWorkspaces
          workspaces={localWorkspaces}
          onClickWorkspace={handleClickWorkspace}
        />
        {selfhostServers.length > 0 && <Divider size="thinner" />}

        {/* 3. selfhost */}
        {selfhostServers.map((server, index) => (
          <FrameworkScope key={server.id} scope={server.scope}>
            <CloudWorkSpaceList
              server={server}
              workspaces={cloudWorkspaces.filter(
                ({ flavour }) => flavour === server.id
              )}
              onClickWorkspace={handleClickWorkspace}
            />
            {index !== selfhostServers.length - 1 && <Divider size="thinner" />}
          </FrameworkScope>
        ))}
      </main>
    </div>
  );
};
