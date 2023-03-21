import {
  Modal,
  ModalCloseButton,
  ModalWrapper,
  Tooltip,
} from '@affine/component';
import type { AccessTokenMessage } from '@affine/datacenter';
import { useTranslation } from '@affine/i18n';
import { HelpIcon, PlusIcon } from '@blocksuite/icons';

import type { RemWorkspace } from '../../../shared';
import { Footer } from '../footer';
import { WorkspaceCard } from '../workspace-card';
import { LanguageMenu } from './language-menu';
import {
  StyledCreateWorkspaceCard,
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
  user: AccessTokenMessage | null;
  workspaces: RemWorkspace[];
  currentWorkspaceId: RemWorkspace['id'] | null;
  open: boolean;
  onClose: () => void;
  onClickWorkspace: (workspace: RemWorkspace) => void;
  onClickWorkspaceSetting: (workspace: RemWorkspace) => void;
  onClickLogin: () => void;
  onClickLogout: () => void;
  onCreateWorkspace: () => void;
}

export const WorkspaceListModal = ({
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
          {workspaces.map(workspace => {
            return (
              <WorkspaceCard
                workspace={workspace}
                currentWorkspaceId={currentWorkspaceId}
                onClick={onClickWorkspace}
                onSettingClick={onClickWorkspaceSetting}
                key={workspace.id}
              />
            );
          })}

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
