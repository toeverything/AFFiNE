import { Modal, ModalWrapper, ModalCloseButton } from '@affine/component';
import { useState } from 'react';
import { CreateWorkspaceModal } from '../create-workspace';

import { Tooltip } from '@affine/component';

import { PlusIcon, HelpIcon } from '@blocksuite/icons';

import { useRouter } from 'next/router';
import { useTranslation } from '@affine/i18n';
import { LanguageMenu } from './SelectLanguageMenu';

import { LoginModal } from '../login-modal';
import { LogoutModal } from '../logout-modal';
import {
  StyledCard,
  StyledSplitLine,
  StyleWorkspaceInfo,
  StyleWorkspaceTitle,
  StyledModalHeaderLeft,
  StyledModalTitle,
  StyledHelperContainer,
  StyledModalContent,
  StyledOperationWrapper,
  StyleWorkspaceAdd,
  StyledModalHeader,
} from './styles';
import { WorkspaceCard } from './WorkspaceCard';
import { Footer } from './Footer';
import { useGlobalState } from '@/store/app';
interface WorkspaceModalProps {
  open: boolean;
  onClose: () => void;
}

export const WorkspaceModal = ({ open, onClose }: WorkspaceModalProps) => {
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const logout = useGlobalState(store => store.logout);
  const dataCenter = useGlobalState(store => store.dataCenter);
  const router = useRouter();
  const { t } = useTranslation();
  const [loginOpen, setLoginOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  return (
    <>
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
            {dataCenter.workspaces.map((item, index) => {
              return (
                <WorkspaceCard
                  workspaceData={item}
                  onClick={workspaceData => {
                    router.replace(`/workspace/${workspaceData.id}`);
                    onClose();
                  }}
                  key={index}
                ></WorkspaceCard>
              );
            })}
            <StyledCard
              onClick={() => {
                setCreateWorkspaceOpen(true);
              }}
            >
              <StyleWorkspaceAdd className="add-icon">
                <PlusIcon />
              </StyleWorkspaceAdd>

              <StyleWorkspaceInfo>
                <StyleWorkspaceTitle>{t('New Workspace')}</StyleWorkspaceTitle>
                <p>{t('Create Or Import')}</p>
              </StyleWorkspaceInfo>
            </StyledCard>
          </StyledModalContent>

          <Footer
            onLogin={() => {
              setLoginOpen(true);
            }}
            onLogout={() => {
              setLogoutOpen(true);
            }}
          />
        </ModalWrapper>
      </Modal>

      <LoginModal
        open={loginOpen}
        onClose={() => {
          setLoginOpen(false);
        }}
      />
      <LogoutModal
        open={logoutOpen}
        onClose={async wait => {
          if (!wait) {
            await logout();
            if (dataCenter.workspaces.length === 0) {
              router.push(`/workspace`);
            } else {
              router.push(`/workspace/${dataCenter.workspaces[0].id}`);
            }
          }
          setLogoutOpen(false);
        }}
      />
      <CreateWorkspaceModal
        open={createWorkspaceOpen}
        onClose={() => {
          setCreateWorkspaceOpen(false);
        }}
      />
    </>
  );
};
