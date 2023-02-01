import { Modal, ModalWrapper, ModalCloseButton } from '@/ui/modal';
import { FlexWrapper } from '@/ui/layout';
import { useState } from 'react';
import { CreateWorkspaceModal } from '../create-workspace';

import { Tooltip } from '@/ui/tooltip';

import { AddIcon, HelpCenterIcon } from '@blocksuite/icons';

import { useAppState } from '@/providers/app-state-provider';
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
interface WorkspaceModalProps {
  open: boolean;
  onClose: () => void;
}

export const WorkspaceModal = ({ open, onClose }: WorkspaceModalProps) => {
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const { workspaceList, logout } = useAppState();
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
                  <HelpCenterIcon />
                </StyledHelperContainer>
              </Tooltip>
            </StyledModalHeaderLeft>

            <StyledOperationWrapper>
              <LanguageMenu />
              <StyledSplitLine />
              <ModalCloseButton
                onClick={() => {
                  onClose();
                }}
                absolute={false}
              />
            </StyledOperationWrapper>
          </StyledModalHeader>

          <StyledModalContent>
            {workspaceList.map((item, index) => {
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
              <FlexWrapper>
                <StyleWorkspaceAdd className="add-icon">
                  <AddIcon fontSize={18} />
                </StyleWorkspaceAdd>
              </FlexWrapper>

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
            router.replace(`/workspace`);
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
