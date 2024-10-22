import { Menu, type MenuProps } from '@affine/component';
import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import { track } from '@affine/track';
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
  onCreatedWorkspace?: (payload: {
    metadata: WorkspaceMetadata;
    defaultDocId?: string;
  }) => void;
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
          hideCollaborationIcon={true}
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
  const { jumpToPage } = useNavigateHelper();

  const handleClickWorkspace = useCallback(
    (workspaceMetadata: WorkspaceMetadata) => {
      onSelectWorkspace?.(workspaceMetadata);
      if (document.startViewTransition) {
        document.startViewTransition(() => {
          jumpToPage(workspaceMetadata.id, 'all');
          return new Promise(resolve =>
            setTimeout(resolve, 150)
          ); /* start transition after 150ms */
        });
      } else {
        jumpToPage(workspaceMetadata.id, 'all');
      }
    },
    [onSelectWorkspace, jumpToPage]
  );
  const handleCreatedWorkspace = useCallback(
    (payload: { metadata: WorkspaceMetadata; defaultDocId?: string }) => {
      onCreatedWorkspace?.(payload);
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
    [jumpToPage, onCreatedWorkspace]
  );
  return (
    <WorkspaceSelector
      onSelectWorkspace={handleClickWorkspace}
      onCreatedWorkspace={handleCreatedWorkspace}
      {...props}
    />
  );
};
