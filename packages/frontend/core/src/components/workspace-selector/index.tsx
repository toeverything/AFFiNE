import { Menu, type MenuProps } from '@affine/component';
import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import { GlobalContextService } from '@affine/core/modules/global-context';
import { WorkbenchService } from '@affine/core/modules/workbench';
import {
  type WorkspaceMetadata,
  WorkspacesService,
} from '@affine/core/modules/workspace';
import { track } from '@affine/track';
import {
  useLiveData,
  useServiceOptional,
  useServices,
} from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';

import { UserWithWorkspaceList } from './user-with-workspace-list';
import { WorkspaceCard } from './workspace-card';

interface WorkspaceSelectorProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  workspaceMetadata?: WorkspaceMetadata;
  onSelectWorkspace?: (workspaceMetadata: WorkspaceMetadata) => void;
  onCreatedWorkspace?: (payload: {
    metadata: WorkspaceMetadata;
    defaultDocId?: string;
  }) => void;
  showEnableCloudButton?: boolean;
  showArrowDownIcon?: boolean;
  showSyncStatus?: boolean;
  disable?: boolean;
  menuContentOptions?: MenuProps['contentOptions'];
  className?: string;
  /** if true, will hide cloud/local, and scale the avatar */
  dense?: boolean;
}

export const WorkspaceSelector = ({
  workspaceMetadata: outerWorkspaceMetadata,
  onSelectWorkspace,
  onCreatedWorkspace,
  showArrowDownIcon,
  disable,
  open: outerOpen,
  onOpenChange: outerOnOpenChange,
  showEnableCloudButton,
  showSyncStatus,
  className,
  menuContentOptions,
  dense,
}: WorkspaceSelectorProps) => {
  const { workspacesService, globalContextService } = useServices({
    GlobalContextService,
    WorkspacesService,
  });
  const [innerOpen, setOpened] = useState(false);
  const open = outerOpen ?? innerOpen;
  const onOpenChange = useCallback(
    (open: boolean) => {
      outerOnOpenChange !== undefined
        ? outerOnOpenChange?.(open)
        : setOpened(open);
    },
    [outerOnOpenChange]
  );
  const closeUserWorkspaceList = useCallback(() => {
    if (outerOnOpenChange) {
      outerOnOpenChange(false);
    } else {
      setOpened(false);
    }
  }, [outerOnOpenChange]);
  const openUserWorkspaceList = useCallback(() => {
    track.$.navigationPanel.workspaceList.open();
    if (outerOnOpenChange) {
      outerOnOpenChange(true);
    } else {
      setOpened(true);
    }
  }, [outerOnOpenChange]);

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
        onOpenChange,
      }}
      items={
        <UserWithWorkspaceList
          onEventEnd={closeUserWorkspaceList}
          onClickWorkspace={onSelectWorkspace}
          onCreatedWorkspace={onCreatedWorkspace}
          showEnableCloudButton={showEnableCloudButton}
        />
      }
      contentOptions={{
        // hide trigger
        sideOffset: dense ? -32 : -58,
        onInteractOutside: closeUserWorkspaceList,
        onEscapeKeyDown: closeUserWorkspaceList,
        ...menuContentOptions,
        style: {
          width: '300px',
          maxHeight: 'min(800px, calc(100vh - 200px))',
          padding: 0,
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
          hideTeamWorkspaceIcon={true}
          data-testid="current-workspace-card"
          dense={dense}
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
  const workbench = useServiceOptional(WorkbenchService)?.workbench;

  const handleClickWorkspace = useCallback(
    (workspaceMetadata: WorkspaceMetadata) => {
      onSelectWorkspace?.(workspaceMetadata);

      const closeInactiveViews = () =>
        workbench?.views$.value.forEach(view => {
          if (workbench?.activeView$.value !== view) {
            workbench?.close(view);
          }
        });

      if (document.startViewTransition) {
        document.startViewTransition(() => {
          closeInactiveViews();
          jumpToPage(workspaceMetadata.id, 'all');
          return new Promise(resolve =>
            setTimeout(resolve, 150)
          ); /* start transition after 150ms */
        });
      } else {
        closeInactiveViews();
        jumpToPage(workspaceMetadata.id, 'all');
      }
    },
    [jumpToPage, onSelectWorkspace, workbench]
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
