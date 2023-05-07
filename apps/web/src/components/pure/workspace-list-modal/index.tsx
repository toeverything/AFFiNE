import {
  Menu,
  MenuItem,
  Modal,
  ModalCloseButton,
  ModalWrapper,
  Tooltip,
} from '@affine/component';
import { WorkspaceList } from '@affine/component/workspace-list';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { AccessTokenMessage } from '@affine/workspace/affine/login';
import type { AffineWorkspace, LocalWorkspace } from '@affine/workspace/type';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { HelpIcon, ImportIcon, PlusIcon } from '@blocksuite/icons';
import type { DragEndEvent } from '@dnd-kit/core';
import { useCallback, useRef } from 'react';

import type { AllWorkspace } from '../../../shared';
import { Footer } from '../footer';
import {
  StyledCreateWorkspaceCard,
  StyledCreateWorkspaceCardPill,
  StyledCreateWorkspaceCardPillContainer,
  StyledCreateWorkspaceCardPillContent,
  StyledCreateWorkspaceCardPillIcon,
  StyledCreateWorkspaceCardPillTextSecondary,
  StyledHelperContainer,
  StyledModalContent,
  StyledModalHeader,
  StyledModalHeaderLeft,
  StyledModalTitle,
  StyledOperationWrapper,
  StyleWorkspaceAdd,
  StyleWorkspaceInfo,
  StyleWorkspaceTitle,
} from './styles';

interface WorkspaceModalProps {
  disabled?: boolean;
  user: AccessTokenMessage | null;
  workspaces: AllWorkspace[];
  currentWorkspaceId: AllWorkspace['id'] | null;
  open: boolean;
  onClose: () => void;
  onClickWorkspace: (workspace: AllWorkspace) => void;
  onClickWorkspaceSetting: (workspace: AllWorkspace) => void;
  onClickLogin: () => void;
  onClickLogout: () => void;
  onNewWorkspace: () => void;
  onAddWorkspace: () => void;
  onMoveWorkspace: (activeId: string, overId: string) => void;
}

export const WorkspaceListModal = ({
  disabled,
  open,
  onClose,
  workspaces,
  user,
  onClickLogin,
  onClickLogout,
  onClickWorkspace,
  onClickWorkspaceSetting,
  onNewWorkspace,
  onAddWorkspace,
  currentWorkspaceId,
  onMoveWorkspace,
}: WorkspaceModalProps) => {
  const t = useAFFiNEI18N();
  const anchorEL = useRef<HTMLDivElement>(null);
  return (
    <Modal open={open} onClose={onClose}>
      <ModalWrapper
        width={720}
        height={690}
        style={{
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <StyledModalHeader>
          <StyledModalHeaderLeft>
            <StyledModalTitle>{t['My Workspaces']()}</StyledModalTitle>
            <Tooltip
              content={t['Workspace description']()}
              placement="top-start"
              disablePortal={true}
            >
              <StyledHelperContainer>
                <HelpIcon />
              </StyledHelperContainer>
            </Tooltip>
          </StyledModalHeaderLeft>

          <StyledOperationWrapper>
            <ModalCloseButton
              data-testid="close-workspace-modal"
              onClick={() => {
                onClose();
              }}
              absolute={false}
            />
          </StyledOperationWrapper>
        </StyledModalHeader>

        <StyledModalContent>
          <WorkspaceList
            disabled={disabled}
            items={
              workspaces.filter(
                ({ flavour }) => flavour !== WorkspaceFlavour.PUBLIC
              ) as (AffineWorkspace | LocalWorkspace)[]
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
          {!environment.isDesktop && (
            <StyledCreateWorkspaceCard
              onClick={onNewWorkspace}
              data-testid="new-workspace"
            >
              <StyleWorkspaceAdd className="add-icon">
                <PlusIcon />
              </StyleWorkspaceAdd>

              <StyleWorkspaceInfo>
                <StyleWorkspaceTitle>
                  {t['New Workspace']()}
                </StyleWorkspaceTitle>
                <p>{t['Create Or Import']()}</p>
              </StyleWorkspaceInfo>
            </StyledCreateWorkspaceCard>
          )}

          {environment.isDesktop && (
            <Menu
              placement="auto"
              trigger={['click', 'hover']}
              zIndex={1000}
              content={
                <StyledCreateWorkspaceCardPillContainer>
                  <StyledCreateWorkspaceCardPill>
                    <MenuItem
                      style={{
                        height: 'auto',
                        padding: '8px 12px',
                      }}
                      onClick={onNewWorkspace}
                      data-testid="new-workspace"
                    >
                      <StyledCreateWorkspaceCardPillContent>
                        <div>
                          <p>{t['New Workspace']()}</p>
                          <StyledCreateWorkspaceCardPillTextSecondary>
                            <p>{t['Create your own workspace']()}</p>
                          </StyledCreateWorkspaceCardPillTextSecondary>
                        </div>
                        <StyledCreateWorkspaceCardPillIcon>
                          <PlusIcon />
                        </StyledCreateWorkspaceCardPillIcon>
                      </StyledCreateWorkspaceCardPillContent>
                    </MenuItem>
                  </StyledCreateWorkspaceCardPill>
                  <StyledCreateWorkspaceCardPill>
                    <MenuItem
                      disabled={!environment.isDesktop}
                      onClick={onAddWorkspace}
                      data-testid="add-workspace"
                      style={{
                        height: 'auto',
                        padding: '8px 12px',
                      }}
                    >
                      <StyledCreateWorkspaceCardPillContent>
                        <div>
                          <p>{t['Add Workspace']()}</p>
                          <StyledCreateWorkspaceCardPillTextSecondary>
                            <p>{t['Add Workspace Hint']()}</p>
                          </StyledCreateWorkspaceCardPillTextSecondary>
                        </div>
                        <StyledCreateWorkspaceCardPillIcon>
                          <ImportIcon />
                        </StyledCreateWorkspaceCardPillIcon>
                      </StyledCreateWorkspaceCardPillContent>
                    </MenuItem>
                  </StyledCreateWorkspaceCardPill>
                </StyledCreateWorkspaceCardPillContainer>
              }
            >
              <StyledCreateWorkspaceCard
                ref={anchorEL}
                data-testid="add-or-new-workspace"
              >
                <StyleWorkspaceAdd className="add-icon">
                  <PlusIcon />
                </StyleWorkspaceAdd>

                <StyleWorkspaceInfo>
                  <StyleWorkspaceTitle>
                    {t['New Workspace']()}
                  </StyleWorkspaceTitle>
                  <p>{t['Create Or Import']()}</p>
                </StyleWorkspaceInfo>
              </StyledCreateWorkspaceCard>
            </Menu>
          )}
        </StyledModalContent>

        <Footer user={user} onLogin={onClickLogin} onLogout={onClickLogout} />
      </ModalWrapper>
    </Modal>
  );
};
