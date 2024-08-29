import { Menu, type MenuProps } from '@affine/component';
import { useNavigateHelper } from '@affine/core/hooks/use-navigate-helper';
import { track } from '@affine/core/mixpanel';
import type { CreateWorkspaceCallbackPayload } from '@affine/core/modules/create-workspace';
import { WorkspaceSubPath } from '@affine/core/shared';
import {
  GlobalContextService,
  useLiveData,
  useServices,
  type WorkspaceMetadata,
  WorkspacesService,
} from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';

import { UserWithWorkspaceList } from './user-with-workspace-list';
import { WorkspaceCard } from './workspace-card';

interface WorkspaceSelectorProps {
  open?: boolean;
  workspaceMetadata?: WorkspaceMetadata;
  onSelectWorkspace?: (workspaceMetadata: WorkspaceMetadata) => void;
  onCreatedWorkspace?: (payload: CreateWorkspaceCallbackPayload) => void;
  showSettingsButton?: boolean;
  showEnableCloudButton?: boolean;
  showArrowDownIcon?: boolean;
  showSyncStatus?: boolean;
  disable?: boolean;
  menuContentOptions?: MenuProps['contentOptions'];
  className?: string;
}

export const WorkspaceSelector = ({
  workspaceMetadata: outerWorkspaceMetadata,
  onSelectWorkspace,
  onCreatedWorkspace,
  showSettingsButton,
  showArrowDownIcon,
  disable,
  open: outerOpen,
  showEnableCloudButton,
  showSyncStatus,
  className,
  menuContentOptions,
}: WorkspaceSelectorProps) => {
  const { workspacesService, globalContextService } = useServices({
    GlobalContextService,
    WorkspacesService,
  });
  const [innerOpen, setOpened] = useState(false);
  const open = outerOpen ?? innerOpen;
  const closeUserWorkspaceList = useCallback(() => {
    setOpened(false);
  }, []);
  const openUserWorkspaceList = useCallback(() => {
    track.$.navigationPanel.workspaceList.open();
    setOpened(true);
  }, []);

  const currentWorkspaceId = useLiveData(
    globalContextService.globalContext.workspaceId.$
  );
  const currentWorkspaceMetadata = useLiveData(
    currentWorkspaceId
      ? workspacesService.list.workspace$(currentWorkspaceId)
      : null
  );
  const workspaceMetadata = outerWorkspaceMetadata ?? currentWorkspaceMetadata;

  // revalidate workspace list when open workspace list
  useEffect(() => {
    if (open) {
      workspacesService.list.revalidate();
    }
  }, [workspacesService, open]);

  return (
    <Menu
      rootOptions={{
        open,
      }}
      items={
        <UserWithWorkspaceList
          onEventEnd={closeUserWorkspaceList}
          onClickWorkspace={onSelectWorkspace}
          onCreatedWorkspace={onCreatedWorkspace}
          showEnableCloudButton={showEnableCloudButton}
          showSettingsButton={showSettingsButton}
        />
      }
      contentOptions={{
        // hide trigger
        sideOffset: -58,
        onInteractOutside: closeUserWorkspaceList,
        onEscapeKeyDown: closeUserWorkspaceList,
        ...menuContentOptions,
        style: {
          width: '300px',
          ...menuContentOptions?.style,
        },
      }}
    >
      {workspaceMetadata ? (
        <WorkspaceCard
          workspaceMetadata={workspaceMetadata}
          onClick={openUserWorkspaceList}
          showSyncStatus={showSyncStatus}
          className={className}
          showArrowDownIcon={showArrowDownIcon}
          disable={disable}
          data-testid="current-workspace-card"
        />
      ) : (
        <span></span>
      )}
    </Menu>
  );
};

export const WorkspaceNavigator = ({
  onSelectWorkspace,
  onCreatedWorkspace,
  ...props
}: WorkspaceSelectorProps) => {
  const { jumpToSubPath, jumpToPage } = useNavigateHelper();

  const handleClickWorkspace = useCallback(
    (workspaceMetadata: WorkspaceMetadata) => {
      onSelectWorkspace?.(workspaceMetadata);
      if (document.startViewTransition) {
        document.startViewTransition(() => {
          jumpToSubPath(workspaceMetadata.id, WorkspaceSubPath.ALL);
          return new Promise(resolve =>
            setTimeout(resolve, 150)
          ); /* start transition after 150ms */
        });
      } else {
        jumpToSubPath(workspaceMetadata.id, WorkspaceSubPath.ALL);
      }
    },
    [onSelectWorkspace, jumpToSubPath]
  );
  const handleCreatedWorkspace = useCallback(
    (payload: CreateWorkspaceCallbackPayload) => {
      onCreatedWorkspace?.(payload);
      if (document.startViewTransition) {
        document.startViewTransition(() => {
          if (payload.defaultDocId) {
            jumpToPage(payload.meta.id, payload.defaultDocId);
          } else {
            jumpToSubPath(payload.meta.id, WorkspaceSubPath.ALL);
          }
          return new Promise(resolve =>
            setTimeout(resolve, 150)
          ); /* start transition after 150ms */
        });
      } else {
        if (payload.defaultDocId) {
          jumpToPage(payload.meta.id, payload.defaultDocId);
        } else {
          jumpToSubPath(payload.meta.id, WorkspaceSubPath.ALL);
        }
      }
    },
    [jumpToPage, jumpToSubPath, onCreatedWorkspace]
  );
  return (
    <WorkspaceSelector
      onSelectWorkspace={handleClickWorkspace}
      onCreatedWorkspace={handleCreatedWorkspace}
      {...props}
    />
  );
};
