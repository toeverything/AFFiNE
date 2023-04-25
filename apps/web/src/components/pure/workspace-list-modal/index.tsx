import {
  Menu,
  MenuItem,
  Modal,
  ModalCloseButton,
  ModalWrapper,
  Tooltip,
} from '@affine/component';
import { WorkspaceList } from '@affine/component/workspace-list';
import { useTranslation } from '@affine/i18n';
import type { AccessTokenMessage } from '@affine/workspace/affine/login';
import type { AffineWorkspace, LocalWorkspace } from '@affine/workspace/type';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { HelpIcon, PlusIcon } from '@blocksuite/icons';
import type { DragEndEvent } from '@dnd-kit/core';
import { useCallback, useRef } from 'react';

import type { AllWorkspace } from '../../../shared';
import { Footer } from '../footer';
import { LanguageMenu } from './language-menu';
import {
  StyledCreateWorkspaceCard,
  StyledCreateWorkspaceCardPill,
  StyledCreateWorkspaceCardPillContainer,
  StyledHelperContainer,
  StyledModalContent,
  StyledModalHeader,
  StyledModalHeaderLeft,
  StyledModalTitle,
  StyledOperationWrapper,
  StyledSplitLine,
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
  onCreateWorkspace: () => void;
  onImportWorkspace: () => void;
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
  onCreateWorkspace,
  onImportWorkspace,
  currentWorkspaceId,
  onMoveWorkspace,
}: WorkspaceModalProps) => {
  const { t } = useTranslation();
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
            <StyledModalTitle>{t('My Workspaces')}</StyledModalTitle>
            <Tooltip
              content={t('Workspace description')}
              placement="top-start"
              disablePortal={true}
            >
              <StyledHelperContainer>
                <HelpIcon />
              </StyledHelperContainer>
            </Tooltip>
          </StyledModalHeaderLeft>

          <StyledOperationWrapper>
            <LanguageMenu />
            <StyledSplitLine />
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
          <Menu
            width={248}
            placement="right-start"
            trigger="click"
            zIndex={1000}
            content={
              <StyledCreateWorkspaceCardPillContainer>
                <StyledCreateWorkspaceCardPill>
                  <MenuItem
                    onClick={onCreateWorkspace}
                    data-testid="add-workspace"
                  >
                    <p>{t('New Workspace')}</p>
                  </MenuItem>
                </StyledCreateWorkspaceCardPill>
                <StyledCreateWorkspaceCardPill>
                  <MenuItem
                    disabled={!environment.isDesktop}
                    onClick={onImportWorkspace}
                    data-testid="add-workspace"
                  >
                    <p>{t('Add Workspace')}</p>
                  </MenuItem>
                </StyledCreateWorkspaceCardPill>
              </StyledCreateWorkspaceCardPillContainer>
            }
          >
            <StyledCreateWorkspaceCard
              ref={anchorEL}
              data-testid="new-workspace"
            >
              <StyleWorkspaceAdd className="add-icon">
                <PlusIcon />
              </StyleWorkspaceAdd>

              <StyleWorkspaceInfo>
                <StyleWorkspaceTitle>{t('New Workspace')}</StyleWorkspaceTitle>
                <p>{t('Create Or Import')}</p>
              </StyleWorkspaceInfo>
            </StyledCreateWorkspaceCard>
          </Menu>
        </StyledModalContent>

        <Footer user={user} onLogin={onClickLogin} onLogout={onClickLogout} />
      </ModalWrapper>
    </Modal>
  );
};
