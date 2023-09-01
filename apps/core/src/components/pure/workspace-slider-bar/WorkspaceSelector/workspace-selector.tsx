import { WorkspaceAvatar } from '@affine/component/workspace-avatar';
import { WorkspaceFlavour } from '@affine/env/workspace';
import {
  CloudWorkspaceIcon,
  LocalWorkspaceIcon,
  NoNetworkIcon,
  UnsyncIcon,
} from '@blocksuite/icons';
import { Tooltip } from '@toeverything/components/tooltip';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import { atom, useAtomValue, useSetAtom } from 'jotai';
import {
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useMemo,
  useState,
} from 'react';

import { useDatasourceSync } from '../../../../hooks/use-datasource-sync';
import { useSystemOnline } from '../../../../hooks/use-system-online';
import type { AllWorkspace } from '../../../../shared';
import { workspaceAvatarStyle } from './index.css';
import { Loading } from './loading-icon';
import {
  StyledSelectorContainer,
  StyledSelectorWrapper,
  StyledWorkspaceName,
  StyledWorkspaceStatus,
} from './styles';

export interface WorkspaceSelectorProps {
  currentWorkspace: AllWorkspace;
  onClick: () => void;
}

const hoverAtom = atom(false);

const CloudWorkspaceStatus = () => {
  return (
    <>
      <CloudWorkspaceIcon />
      AFFiNE Cloud
    </>
  );
};
const SyncingWorkspaceStatus = () => {
  return (
    <>
      <Loading />
      Syncing...
    </>
  );
};
const UnSyncWorkspaceStatus = () => {
  return (
    <>
      <UnsyncIcon />
      Wait for upload
    </>
  );
};

const LocalWorkspaceStatus = () => {
  return (
    <>
      <LocalWorkspaceIcon />
      Local
    </>
  );
};

const OfflineStatus = () => {
  return (
    <>
      <NoNetworkIcon />
      Offline
    </>
  );
};

const WorkspaceStatus = ({
  currentWorkspace,
}: {
  currentWorkspace: AllWorkspace;
}) => {
  const isOnline = useSystemOnline();
  // todo: finish display sync status
  const [forceSyncStatus, startForceSync] = useDatasourceSync(
    currentWorkspace.blockSuiteWorkspace
  );
  const setIsHovered = useSetAtom(hoverAtom);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const content = useMemo(() => {
    if (currentWorkspace.flavour === WorkspaceFlavour.LOCAL) {
      return 'Saved locally';
    }
    if (!isOnline) {
      return 'Disconnected, please check your network connection';
    }
    switch (forceSyncStatus.type) {
      case 'syncing':
        return 'Syncing with AFFiNE Cloud';
      case 'error':
        return 'Sync failed due to server issues, please try again later.';
      default:
        return 'Sync with AFFiNE Cloud';
    }
  }, [currentWorkspace.flavour, forceSyncStatus.type, isOnline]);
  const CloudWorkspaceSyncStatus = useCallback(() => {
    if (forceSyncStatus.type === 'syncing') {
      return SyncingWorkspaceStatus();
    } else if (forceSyncStatus.type === 'error') {
      return UnSyncWorkspaceStatus();
    } else {
      return CloudWorkspaceStatus();
    }
  }, [forceSyncStatus.type]);

  const handleClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      if (
        currentWorkspace.flavour === WorkspaceFlavour.LOCAL ||
        forceSyncStatus.type === 'syncing'
      ) {
        return;
      }
      startForceSync();
    },
    [currentWorkspace.flavour, forceSyncStatus.type, startForceSync]
  );
  return (
    <div style={{ display: 'flex' }}>
      <Tooltip
        content={content}
        portalOptions={{
          container,
        }}
      >
        <StyledWorkspaceStatus
          onMouseEnter={() => {
            setIsHovered(true);
          }}
          ref={setContainer}
          onMouseLeave={() => setIsHovered(false)}
          onClick={handleClick}
        >
          {currentWorkspace.flavour === WorkspaceFlavour.AFFINE_CLOUD ? (
            !isOnline ? (
              <OfflineStatus />
            ) : (
              <CloudWorkspaceSyncStatus />
            )
          ) : (
            <LocalWorkspaceStatus />
          )}
        </StyledWorkspaceStatus>
      </Tooltip>
    </div>
  );
};

/**
 * @todo-Doma Co-locate WorkspaceListModal with {@link WorkspaceSelector},
 *            because it's never used elsewhere.
 */
export const WorkspaceSelector = ({
  currentWorkspace,
  onClick,
}: WorkspaceSelectorProps) => {
  const [name] = useBlockSuiteWorkspaceName(
    currentWorkspace.blockSuiteWorkspace
  );
  // Open dialog when `Enter` or `Space` pressed
  // TODO-Doma Refactor with `@radix-ui/react-dialog` or other libraries that handle these out of the box and be accessible by default
  // TODO: Delete this?
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        // TODO-Doma Rename this callback to `onOpenDialog` or something to reduce ambiguity.
        onClick();
      }
    },
    [onClick]
  );
  const isHovered = useAtomValue(hoverAtom);

  return (
    <StyledSelectorContainer
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      disableHoverBackground={isHovered}
      data-testid="current-workspace"
      id="current-workspace"
    >
      <WorkspaceAvatar
        data-testid="workspace-avatar"
        className={workspaceAvatarStyle}
        size={40}
        workspace={currentWorkspace.blockSuiteWorkspace}
      />
      <StyledSelectorWrapper>
        <StyledWorkspaceName data-testid="workspace-name">
          {name}
        </StyledWorkspaceName>
        <WorkspaceStatus currentWorkspace={currentWorkspace} />
      </StyledSelectorWrapper>
    </StyledSelectorContainer>
  );
};
