import {
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
import { useCallback } from 'react';

import type { AllWorkspace } from '../../../shared';
import { Footer } from '../footer';
import {
  StyledCreateWorkspaceCard,
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
  onCreateWorkspace: () => void;
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
  currentWorkspaceId,
  onMoveWorkspace,
}: WorkspaceModalProps) => {
  const { t } = useTranslation();

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
          <StyledCreateWorkspaceCard
            data-testid="new-workspace"
            onClick={onCreateWorkspace}
          >
            <StyleWorkspaceAdd className="add-icon">
              <PlusIcon />
            </StyleWorkspaceAdd>

            <StyleWorkspaceInfo>
              <StyleWorkspaceTitle>{t('New Workspace')}</StyleWorkspaceTitle>
              <p>{t('Create Or Import')}</p>
            </StyleWorkspaceInfo>
          </StyledCreateWorkspaceCard>
        </StyledModalContent>

        <Footer user={user} onLogin={onClickLogin} onLogout={onClickLogout} />
      </ModalWrapper>
    </Modal>
  );
};
