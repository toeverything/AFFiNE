import { ScrollableContainer } from '@affine/component';
import { Divider } from '@affine/component/ui/divider';
import { WorkspaceList } from '@affine/component/workspace-list';
import { useEnableCloud } from '@affine/core/hooks/affine/use-enable-cloud';
import {
  useWorkspaceInfo,
  useWorkspaceName,
} from '@affine/core/hooks/use-workspace-info';
import { AuthService } from '@affine/core/modules/cloud';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { CloudWorkspaceIcon, LocalWorkspaceIcon } from '@blocksuite/icons/rc';
import type { WorkspaceMetadata } from '@toeverything/infra';
import {
  GlobalContextService,
  useLiveData,
  useService,
  WorkspacesService,
} from '@toeverything/infra';
import { useSetAtom } from 'jotai';
import { useCallback, useMemo } from 'react';

import {
  openCreateWorkspaceModalAtom,
  openSettingModalAtom,
} from '../../../../../atoms';
import { WorkspaceSubPath } from '../../../../../shared';
import { useNavigateHelper } from '../.././../../../hooks/use-navigate-helper';
import * as styles from './index.css';

function useIsWorkspaceOwner(meta: WorkspaceMetadata) {
  const info = useWorkspaceInfo(meta);

  return info?.isOwner;
}

interface WorkspaceModalProps {
  disabled?: boolean;
  workspaces: WorkspaceMetadata[];
  currentWorkspaceId?: string | null;
  openingId?: string | null;
  onClickWorkspace: (workspaceMetadata: WorkspaceMetadata) => void;
  onClickWorkspaceSetting: (workspaceMetadata: WorkspaceMetadata) => void;
  onClickEnableCloud?: (meta: WorkspaceMetadata) => void;
  onNewWorkspace: () => void;
  onAddWorkspace: () => void;
}

const CloudWorkSpaceList = ({
  disabled,
  workspaces,
  onClickWorkspace,
  onClickWorkspaceSetting,
  currentWorkspaceId,
}: WorkspaceModalProps) => {
  const t = useAFFiNEI18N();
  if (workspaces.length === 0) {
    return null;
  }
  return (
    <div className={styles.workspaceListWrapper}>
      <div className={styles.workspaceType}>
        <CloudWorkspaceIcon
          width={14}
          height={14}
          className={styles.workspaceTypeIcon}
        />
        {t['com.affine.workspaceList.workspaceListType.cloud']()}
      </div>
      <WorkspaceList
        disabled={disabled}
        items={workspaces}
        currentWorkspaceId={currentWorkspaceId}
        onClick={onClickWorkspace}
        onSettingClick={onClickWorkspaceSetting}
        useIsWorkspaceOwner={useIsWorkspaceOwner}
        useWorkspaceName={useWorkspaceName}
      />
    </div>
  );
};

const LocalWorkspaces = ({
  disabled,
  workspaces,
  onClickWorkspace,
  onClickWorkspaceSetting,
  onClickEnableCloud,
  openingId,
  currentWorkspaceId,
}: WorkspaceModalProps) => {
  const t = useAFFiNEI18N();
  if (workspaces.length === 0) {
    return null;
  }
  return (
    <div className={styles.workspaceListWrapper}>
      <div className={styles.workspaceType}>
        <LocalWorkspaceIcon
          width={14}
          height={14}
          className={styles.workspaceTypeIcon}
        />
        {t['com.affine.workspaceList.workspaceListType.local']()}
      </div>
      <WorkspaceList
        openingId={openingId}
        disabled={disabled}
        items={workspaces}
        currentWorkspaceId={currentWorkspaceId}
        onClick={onClickWorkspace}
        onSettingClick={onClickWorkspaceSetting}
        onEnableCloudClick={onClickEnableCloud}
        useIsWorkspaceOwner={useIsWorkspaceOwner}
        useWorkspaceName={useWorkspaceName}
      />
    </div>
  );
};

export const AFFiNEWorkspaceList = ({
  onEventEnd,
}: {
  onEventEnd?: () => void;
}) => {
  const workspacesService = useService(WorkspacesService);
  const workspaces = useLiveData(workspacesService.list.workspaces$);
  const currentWorkspaceId = useLiveData(
    useService(GlobalContextService).globalContext.workspaceId.$
  );

  const setOpenCreateWorkspaceModal = useSetAtom(openCreateWorkspaceModalAtom);
  const confirmEnableCloud = useEnableCloud();

  const { jumpToSubPath } = useNavigateHelper();

  const setOpenSettingModalAtom = useSetAtom(openSettingModalAtom);

  const session = useService(AuthService).session;
  const status = useLiveData(session.status$);

  const isAuthenticated = status === 'authenticated';

  const cloudWorkspaces = useMemo(
    () =>
      workspaces.filter(
        ({ flavour }) => flavour === WorkspaceFlavour.AFFINE_CLOUD
      ) as WorkspaceMetadata[],
    [workspaces]
  );

  const localWorkspaces = useMemo(
    () =>
      workspaces.filter(
        ({ flavour }) => flavour === WorkspaceFlavour.LOCAL
      ) as WorkspaceMetadata[],
    [workspaces]
  );

  const onClickWorkspaceSetting = useCallback(
    (workspaceMetadata: WorkspaceMetadata) => {
      setOpenSettingModalAtom({
        open: true,
        activeTab: 'workspace:preference',
        workspaceMetadata,
      });
      onEventEnd?.();
    },
    [onEventEnd, setOpenSettingModalAtom]
  );

  const onClickEnableCloud = useCallback(
    (meta: WorkspaceMetadata) => {
      const { workspace, dispose } = workspacesService.open({ metadata: meta });
      confirmEnableCloud(workspace, {
        onFinished: () => {
          dispose();
        },
      });
    },
    [confirmEnableCloud, workspacesService]
  );

  const onClickWorkspace = useCallback(
    (workspaceMetadata: WorkspaceMetadata) => {
      if (document.startViewTransition) {
        document.startViewTransition(() => {
          jumpToSubPath(workspaceMetadata.id, WorkspaceSubPath.ALL);
          onEventEnd?.();
          return new Promise(resolve =>
            setTimeout(resolve, 150)
          ); /* start transition after 150ms */
        });
      } else {
        jumpToSubPath(workspaceMetadata.id, WorkspaceSubPath.ALL);
        onEventEnd?.();
      }
    },
    [jumpToSubPath, onEventEnd]
  );

  const onNewWorkspace = useCallback(() => {
    setOpenCreateWorkspaceModal('new');
    onEventEnd?.();
  }, [onEventEnd, setOpenCreateWorkspaceModal]);

  const onAddWorkspace = useCallback(() => {
    setOpenCreateWorkspaceModal('add');
    onEventEnd?.();
  }, [onEventEnd, setOpenCreateWorkspaceModal]);

  return (
    <ScrollableContainer
      className={styles.workspaceListsWrapper}
      scrollBarClassName={styles.scrollbar}
    >
      {isAuthenticated ? (
        <div>
          <CloudWorkSpaceList
            workspaces={cloudWorkspaces}
            onClickWorkspace={onClickWorkspace}
            onClickWorkspaceSetting={onClickWorkspaceSetting}
            onNewWorkspace={onNewWorkspace}
            onAddWorkspace={onAddWorkspace}
            currentWorkspaceId={currentWorkspaceId}
          />
          {localWorkspaces.length > 0 && cloudWorkspaces.length > 0 ? (
            <Divider size="thinner" />
          ) : null}
        </div>
      ) : null}
      <LocalWorkspaces
        workspaces={localWorkspaces}
        onClickWorkspace={onClickWorkspace}
        onClickWorkspaceSetting={onClickWorkspaceSetting}
        onClickEnableCloud={onClickEnableCloud}
        onNewWorkspace={onNewWorkspace}
        onAddWorkspace={onAddWorkspace}
        currentWorkspaceId={currentWorkspaceId}
      />
    </ScrollableContainer>
  );
};
