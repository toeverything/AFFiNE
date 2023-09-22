import { WorkspaceList } from '@affine/component/workspace-list';
import type {
  AffineCloudWorkspace,
  LocalWorkspace,
} from '@affine/env/workspace';
import { WorkspaceFlavour, WorkspaceSubPath } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { RootWorkspaceMetadata } from '@affine/workspace/atom';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import {
  AccountIcon,
  ImportIcon,
  Logo1Icon,
  MoreHorizontalIcon,
  PlusIcon,
  SignOutIcon,
} from '@blocksuite/icons';
import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { IconButton } from '@toeverything/components/button';
import { Divider } from '@toeverything/components/divider';
import { Menu, MenuIcon, MenuItem } from '@toeverything/components/menu';
import {
  currentPageIdAtom,
  currentWorkspaceIdAtom,
} from '@toeverything/infra/atom';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { useSession } from 'next-auth/react';
import { startTransition, useCallback, useMemo, useTransition } from 'react';

import {
  authAtom,
  openCreateWorkspaceModalAtom,
  openDisableCloudAlertModalAtom,
  openSettingModalAtom,
} from '../../../../atoms';
import type { AllWorkspace } from '../../../../shared';
import { signOutCloud } from '../../../../utils/cloud-utils';
import { useNavigateHelper } from '../.././../../hooks/use-navigate-helper';
import {
  StyledCreateWorkspaceCardPill,
  StyledCreateWorkspaceCardPillContent,
  StyledCreateWorkspaceCardPillIcon,
  StyledImportWorkspaceCardPill,
  StyledItem,
  StyledModalBody,
  StyledModalContent,
  StyledModalFooterContent,
  StyledModalHeader,
  StyledModalHeaderContent,
  StyledModalHeaderLeft,
  StyledModalTitle,
  StyledOperationWrapper,
  StyledSignInCardPill,
  StyledSignInCardPillTextCotainer,
  StyledSignInCardPillTextPrimary,
  StyledSignInCardPillTextSecondary,
  StyledWorkspaceFlavourTitle,
} from './styles';

interface WorkspaceModalProps {
  disabled?: boolean;
  workspaces: RootWorkspaceMetadata[];
  currentWorkspaceId: AllWorkspace['id'] | null;
  onClickWorkspace: (workspace: RootWorkspaceMetadata['id']) => void;
  onClickWorkspaceSetting: (workspace: RootWorkspaceMetadata['id']) => void;
  onNewWorkspace: () => void;
  onAddWorkspace: () => void;
  onMoveWorkspace: (activeId: string, overId: string) => void;
}

const AccountMenu = ({
  onOpenAccountSetting,
  onSignOut,
}: {
  onOpenAccountSetting: () => void;
  onSignOut: () => void;
}) => {
  const t = useAFFiNEI18N();

  return (
    <div>
      <MenuItem
        preFix={
          <MenuIcon>
            <AccountIcon />
          </MenuIcon>
        }
        data-testid="editor-option-menu-import"
        onClick={onOpenAccountSetting}
      >
        {t['com.affine.workspace.cloud.account.settings']()}
      </MenuItem>
      <Divider />
      <MenuItem
        preFix={
          <MenuIcon>
            <SignOutIcon />
          </MenuIcon>
        }
        data-testid="editor-option-menu-import"
        onClick={onSignOut}
      >
        {t['com.affine.workspace.cloud.account.logout']()}
      </MenuItem>
    </div>
  );
};

const CloudWorkSpaceList = ({
  disabled,
  workspaces,
  onClickWorkspace,
  onClickWorkspaceSetting,
  currentWorkspaceId,
  onMoveWorkspace,
}: WorkspaceModalProps) => {
  const t = useAFFiNEI18N();

  return (
    <>
      <StyledModalHeader>
        <StyledModalHeaderLeft>
          <StyledWorkspaceFlavourTitle>
            {t['com.affine.workspace.cloud']()}
          </StyledWorkspaceFlavourTitle>
        </StyledModalHeaderLeft>
      </StyledModalHeader>
      <StyledModalContent>
        <WorkspaceList
          disabled={disabled}
          items={
            workspaces.filter(
              ({ flavour }) => flavour === WorkspaceFlavour.AFFINE_CLOUD
            ) as (AffineCloudWorkspace | LocalWorkspace)[]
          }
          currentWorkspaceId={currentWorkspaceId}
          onClick={onClickWorkspace}
          onSettingClick={onClickWorkspaceSetting}
          onDragEnd={useCallback(
            (event: DragEndEvent) => {
              const { active, over } = event;
              if (active.id !== over?.id) {
                onMoveWorkspace(active.id as string, over?.id as string);
              }
            },
            [onMoveWorkspace]
          )}
        />
      </StyledModalContent>
    </>
  );
};

export const UserWithWorkspaceList = ({
  onEventEnd,
}: {
  onEventEnd?: () => void;
}) => {
  const setOpenCreateWorkspaceModal = useSetAtom(openCreateWorkspaceModalAtom);

  const { jumpToSubPath, jumpToIndex } = useNavigateHelper();
  const workspaces = useAtomValue(rootWorkspacesMetadataAtom, {
    delay: 0,
  });
  const setWorkspaces = useSetAtom(rootWorkspacesMetadataAtom);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useAtom(
    currentWorkspaceIdAtom
  );
  const setCurrentPageId = useSetAtom(currentPageIdAtom);
  const [, startCloseTransition] = useTransition();
  const setOpenSettingModalAtom = useSetAtom(openSettingModalAtom);
  const setSettingModalAtom = useSetAtom(openSettingModalAtom);

  const t = useAFFiNEI18N();
  const setOpen = useSetAtom(authAtom);
  const setDisableCloudOpen = useSetAtom(openDisableCloudAlertModalAtom);
  // TODO: AFFiNE Cloud support
  const { data: session, status } = useSession();
  const isLoggedIn = useMemo(() => status === 'authenticated', [status]);
  const cloudWorkspaces = useMemo(
    () =>
      workspaces.filter(
        ({ flavour }) => flavour === WorkspaceFlavour.AFFINE_CLOUD
      ) as (AffineCloudWorkspace | LocalWorkspace)[],
    [workspaces]
  );
  const localWorkspaces = useMemo(
    () =>
      workspaces.filter(
        ({ flavour }) => flavour === WorkspaceFlavour.LOCAL
      ) as (AffineCloudWorkspace | LocalWorkspace)[],
    [workspaces]
  );

  const onClickWorkspaceSetting = useCallback(
    (workspaceId: string) => {
      setOpenSettingModalAtom({
        open: true,
        activeTab: 'workspace',
        workspaceId,
      });
      onEventEnd?.();
    },
    [onEventEnd, setOpenSettingModalAtom]
  );

  const onMoveWorkspace = useCallback(
    (activeId: string, overId: string) => {
      const oldIndex = workspaces.findIndex(w => w.id === activeId);
      const newIndex = workspaces.findIndex(w => w.id === overId);
      startTransition(() => {
        setWorkspaces(workspaces => arrayMove(workspaces, oldIndex, newIndex));
      });
    },
    [setWorkspaces, workspaces]
  );
  const onClickWorkspace = useCallback(
    (workspaceId: string) => {
      startCloseTransition(() => {
        setCurrentWorkspaceId(workspaceId);
        setCurrentPageId(null);
        jumpToSubPath(workspaceId, WorkspaceSubPath.ALL);
      });
      onEventEnd?.();
    },
    [jumpToSubPath, onEventEnd, setCurrentPageId, setCurrentWorkspaceId]
  );
  const onNewWorkspace = useCallback(() => {
    setOpenCreateWorkspaceModal('new');
    onEventEnd?.();
  }, [onEventEnd, setOpenCreateWorkspaceModal]);
  const onAddWorkspace = useCallback(async () => {
    setOpenCreateWorkspaceModal('add');
    onEventEnd?.();
  }, [onEventEnd, setOpenCreateWorkspaceModal]);

  const onOpenAccountSetting = useCallback(() => {
    setSettingModalAtom(prev => ({
      ...prev,
      open: true,
      activeTab: 'account',
    }));
    onEventEnd?.();
  }, [onEventEnd, setSettingModalAtom]);
  const onSignOut = useCallback(async () => {
    signOutCloud()
      .then(() => {
        jumpToIndex();
      })
      .catch(console.error);
    onEventEnd?.();
  }, [onEventEnd, jumpToIndex]);

  return (
    <>
      {!isLoggedIn ? (
        <StyledModalHeaderContent>
          <StyledSignInCardPill>
            <StyledItem
              onClick={async () => {
                if (!runtimeConfig.enableCloud) {
                  setDisableCloudOpen(true);
                } else {
                  setOpen(state => ({
                    ...state,
                    openModal: true,
                  }));
                }
              }}
              data-testid="cloud-signin-button"
            >
              <StyledCreateWorkspaceCardPillContent>
                <StyledCreateWorkspaceCardPillIcon>
                  <Logo1Icon />
                </StyledCreateWorkspaceCardPillIcon>
                <StyledSignInCardPillTextCotainer>
                  <StyledSignInCardPillTextPrimary>
                    {t['com.affine.workspace.cloud.auth']()}
                  </StyledSignInCardPillTextPrimary>
                  <StyledSignInCardPillTextSecondary>
                    {t['com.affine.workspace.cloud.description']()}
                  </StyledSignInCardPillTextSecondary>
                </StyledSignInCardPillTextCotainer>
              </StyledCreateWorkspaceCardPillContent>
            </StyledItem>
          </StyledSignInCardPill>
          <Divider
            style={{
              margin: '12px 0px',
            }}
          />
        </StyledModalHeaderContent>
      ) : (
        <StyledModalHeaderContent>
          <StyledModalHeader>
            <StyledModalTitle>{session?.user.email}</StyledModalTitle>
            <StyledOperationWrapper>
              <Menu
                items={
                  <AccountMenu
                    onOpenAccountSetting={onOpenAccountSetting}
                    onSignOut={onSignOut}
                  />
                }
                contentOptions={{
                  side: 'right',
                  sideOffset: 30,
                }}
              >
                <IconButton
                  data-testid="more-button"
                  icon={<MoreHorizontalIcon />}
                  type="plain"
                />
              </Menu>
            </StyledOperationWrapper>
          </StyledModalHeader>
          <Divider style={{ margin: '12px 0px' }} />
        </StyledModalHeaderContent>
      )}
      <StyledModalBody>
        {isLoggedIn && cloudWorkspaces.length !== 0 ? (
          <>
            <CloudWorkSpaceList
              workspaces={workspaces}
              onClickWorkspace={onClickWorkspace}
              onClickWorkspaceSetting={onClickWorkspaceSetting}
              onNewWorkspace={onNewWorkspace}
              onAddWorkspace={onAddWorkspace}
              currentWorkspaceId={currentWorkspaceId}
              onMoveWorkspace={onMoveWorkspace}
            />
            <Divider
              style={{
                margin: '12px 0px',
              }}
            />
          </>
        ) : null}
        <StyledModalHeader>
          <StyledWorkspaceFlavourTitle>
            {t['com.affine.workspace.local']()}
          </StyledWorkspaceFlavourTitle>
        </StyledModalHeader>
        <StyledModalContent>
          <WorkspaceList
            items={localWorkspaces}
            currentWorkspaceId={currentWorkspaceId}
            onClick={onClickWorkspace}
            onSettingClick={onClickWorkspaceSetting}
            onDragEnd={useCallback(
              (event: DragEndEvent) => {
                const { active, over } = event;
                if (active.id !== over?.id) {
                  onMoveWorkspace(active.id as string, over?.id as string);
                }
              },
              [onMoveWorkspace]
            )}
          />
        </StyledModalContent>
        {runtimeConfig.enableSQLiteProvider && environment.isDesktop ? (
          <StyledImportWorkspaceCardPill>
            <StyledItem onClick={onAddWorkspace} data-testid="add-workspace">
              <StyledCreateWorkspaceCardPillContent
                style={{ gap: '14px', paddingLeft: '2px' }}
              >
                <StyledCreateWorkspaceCardPillIcon style={{ fontSize: '24px' }}>
                  <ImportIcon />
                </StyledCreateWorkspaceCardPillIcon>
                <div>
                  <p>{t['com.affine.workspace.local.import']()}</p>
                </div>
              </StyledCreateWorkspaceCardPillContent>
            </StyledItem>
          </StyledImportWorkspaceCardPill>
        ) : null}
      </StyledModalBody>
      <StyledModalFooterContent>
        <StyledCreateWorkspaceCardPill>
          <StyledItem onClick={onNewWorkspace} data-testid="new-workspace">
            <StyledCreateWorkspaceCardPillContent>
              <StyledCreateWorkspaceCardPillIcon>
                <PlusIcon />
              </StyledCreateWorkspaceCardPillIcon>
              <div>
                <p>{t['New Workspace']()}</p>
              </div>
            </StyledCreateWorkspaceCardPillContent>
          </StyledItem>
        </StyledCreateWorkspaceCardPill>
      </StyledModalFooterContent>
    </>
  );
};
