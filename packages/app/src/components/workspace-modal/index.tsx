import { styled } from '@/styles';
import { Modal, ModalWrapper } from '@/ui/modal';
import { Button, IconButton } from '@/ui/button';
import { useState } from 'react';
import { CreateWorkspaceModal } from '../create-workspace';
import {
  UsersIcon,
  AddIcon,
  LogOutIcon,
  CloudInsyncIcon,
  PublishIcon,
  CloseIcon,
} from '@blocksuite/icons';
import {
  WorkspaceAvatar,
  WorkspaceUnitAvatar,
} from '@/components/workspace-avatar';
import { useAppState } from '@/providers/app-state-provider';
import { useRouter } from 'next/router';
import { useTranslation } from '@affine/i18n';
import { LanguageMenu } from './languageMenu';

import { CloudIcon, LineIcon, LocalIcon, OfflineIcon } from './icons';
import { LoginModal } from '../login-modal';
import { LogoutModal } from '../logout-modal';
interface WorkspaceModalProps {
  open: boolean;
  onClose: () => void;
}

export const WorkspaceModal = ({ open, onClose }: WorkspaceModalProps) => {
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const { workspaceList, currentWorkspace, user, logout, isOwner } =
    useAppState();
  const router = useRouter();
  const { t } = useTranslation();
  const [loginOpen, setLoginOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  return (
    <div>
      <Modal open={open} onClose={onClose}>
        <ModalWrapper
          width={720}
          style={{
            padding: '24px 40px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Header>
            <ContentTitle>{t('My Workspaces')}</ContentTitle>
            <HeaderOption>
              <LanguageMenu />
              <div
                style={{
                  display: 'inline-block',
                  border: 'none',
                  margin: '2px 16px',
                  height: '24px',
                  position: 'relative',
                  top: '4px',
                }}
              >
                <LineIcon></LineIcon>
              </div>

              <Button
                style={{ border: 'none', padding: 0 }}
                onClick={() => {
                  onClose();
                }}
              >
                <CloseIcon></CloseIcon>
              </Button>
            </HeaderOption>
          </Header>
          <Content>
            <WorkspaceList>
              {workspaceList.map((item, index) => {
                return (
                  <WorkspaceItem
                    onClick={() => {
                      router.replace(`/workspace/${item.id}`);
                      onClose();
                    }}
                    active={item.id === currentWorkspace?.id}
                    key={index}
                  >
                    <div>
                      <WorkspaceUnitAvatar size={58} workspaceUnit={item} />
                    </div>

                    <StyleWorkspaceInfo>
                      <StyleWorkspaceTitle>
                        {item.name || 'AFFiNE'}
                      </StyleWorkspaceTitle>
                      {isOwner ? (
                        item.provider === 'local' ? (
                          <p>
                            <LocalIcon />
                            Local Workspace
                          </p>
                        ) : (
                          <p>
                            <CloudIcon />
                            Cloud Workspace
                          </p>
                        )
                      ) : (
                        <p>
                          <UsersIcon fontSize={20} color={'#FF646B'} />
                          Joined Workspace
                        </p>
                      )}
                      {item.provider === 'local' && (
                        <p>
                          <OfflineIcon />
                          All data can be accessed offline
                        </p>
                      )}
                      {item.published && (
                        <p>
                          <PublishIcon fontSize={16} /> Published to Web
                        </p>
                      )}
                    </StyleWorkspaceInfo>
                  </WorkspaceItem>
                );
              })}
              <WorkspaceItem
                onClick={() => {
                  setCreateWorkspaceOpen(true);
                }}
              >
                <div>
                  <StyleWorkspaceAdd className="add-icon">
                    <AddIcon fontSize={18} />
                  </StyleWorkspaceAdd>
                </div>

                <StyleWorkspaceInfo>
                  <StyleWorkspaceTitle>New workspace</StyleWorkspaceTitle>
                  <p>Crete or import</p>
                </StyleWorkspaceInfo>
              </WorkspaceItem>
            </WorkspaceList>
            {/* <p style={{ fontSize: '14px', color: '#ccc', margin: '12px 0' }}>
              {t('Tips')}
              {t('Workspace description')}
            </p> */}
          </Content>
          <LoginModal
            open={loginOpen}
            onClose={() => {
              setLoginOpen(false);
            }}
          ></LoginModal>
          <Footer>
            {!user ? (
              <StyleSignIn
                onClick={async () => {
                  setLoginOpen(true);
                }}
              >
                <span>
                  <CloudInsyncIcon fontSize={16} />
                </span>
                Sign in to sync with AFFINE Cloud
              </StyleSignIn>
            ) : (
              <div style={{ display: 'flex' }}>
                <div style={{ paddingTop: '20px' }}>
                  <WorkspaceAvatar
                    size={40}
                    name={user.name}
                    avatar={user.avatar}
                  ></WorkspaceAvatar>
                </div>
                <StyleUserInfo style={{}}>
                  <p>{user.name}</p>
                  <p>{user.email}</p>
                </StyleUserInfo>
                <div style={{ paddingTop: '25px' }}>
                  <IconButton
                    onClick={() => {
                      setLogoutOpen(true);
                      // confirm({
                      //   title: 'Sign out?',
                      //   content: `All data has been stored in the cloud. `,
                      //   confirmText: 'Sign out',
                      //   cancelText: 'Cancel',
                      // }).then(async confirm => {
                      //   // if (confirm) {
                      //   //   if (user) {
                      //   //     await logout();
                      //   //     router.replace(`/workspace`);
                      //   //     toast('Enabled success');
                      //   //   }
                      //   // }
                      // });
                    }}
                  >
                    <LogOutIcon></LogOutIcon>
                  </IconButton>
                </div>
              </div>
            )}
          </Footer>
          <CreateWorkspaceModal
            open={createWorkspaceOpen}
            onClose={() => {
              setCreateWorkspaceOpen(false);
            }}
          ></CreateWorkspaceModal>
          <LogoutModal
            open={logoutOpen}
            onClose={async wait => {
              if (!wait) {
                await logout();
                router.replace(`/workspace`);
              }
              setLogoutOpen(false);
            }}
          ></LogoutModal>
        </ModalWrapper>
      </Modal>
    </div>
  );
};

const Header = styled('div')({
  display: 'flex',
});

const Content = styled('div')({
  flexDirection: 'column',
  alignItems: 'center',
  gap: '16px',
  flex: 1,
});
const HeaderOption = styled.div(() => {
  return {
    marginLeft: '16px',
  };
});
const ContentTitle = styled('div')({
  fontSize: '20px',
  lineHeight: '24px',
  fontWeight: 600,
  textAlign: 'left',
  flex: 1,
});

const WorkspaceList = styled('div')({
  maxHeight: '500px',
  overflow: 'auto',
  display: 'grid',
  gridRowGap: '24px',
  gridColumnGap: '24px',
  fontSize: '16px',
  marginTop: '36px',
  gridTemplateColumns: 'repeat(2, 1fr)',
});

export const WorkspaceItem = styled.div<{
  active?: boolean;
}>(({ theme, active }) => {
  const borderColor = active ? theme.colors.primaryColor : 'transparent';
  return {
    cursor: 'pointer',
    padding: '16px',
    height: '124px',
    boxShadow: theme.shadow.modal,
    display: 'flex',
    borderRadius: '12px',
    border: `1px solid ${borderColor}`,
    ':hover': {
      background: theme.colors.hoverBackground,
      '.add-icon': {
        border: `1.5px dashed ${theme.colors.primaryColor}`,
        svg: {
          fill: theme.colors.primaryColor,
        },
      },
    },
  };
});

const StyleWorkspaceInfo = styled.div(({ theme }) => {
  return {
    marginLeft: '16px',
    p: {
      fontSize: theme.font.xs,
      lineHeight: '16px',
    },
    svg: {
      verticalAlign: 'text-bottom',
      marginRight: '8px',
    },
  };
});

const StyleWorkspaceTitle = styled.div(({ theme }) => {
  return {
    fontSize: theme.font.base,
    fontWeight: 600,
    lineHeight: '24px',
    marginBottom: '8px',
  };
});

const StyleWorkspaceAdd = styled.div(() => {
  return {
    width: '58px',
    height: '58px',
    borderRadius: '100%',
    textAlign: 'center',
    background: '#f4f5fa',
    border: '1.5px dashed #f4f5fa',
    lineHeight: '58px',
    marginTop: '2px',
  };
});

const Footer = styled('div')({
  paddingTop: '16px',
});

const StyleUserInfo = styled.div(({ theme }) => {
  return {
    textAlign: 'left',
    marginLeft: '16px',
    marginTop: '16px',
    flex: 1,
    p: {
      lineHeight: '24px',
      color: theme.colors.iconColor,
    },
    'p:nth-child(1)': {
      color: theme.colors.textColor,
      fontWeight: 600,
    },
  };
});

const StyleSignIn = styled.div(({ theme }) => {
  return {
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: 700,
    color: theme.colors.iconColor,
    span: {
      display: 'inline-block',
      width: '40px',
      height: '40px',
      borderRadius: '40px',
      backgroundColor: theme.colors.innerHoverBackground,
      textAlign: 'center',
      lineHeight: '44px',
      marginRight: '16px',
      svg: {
        fill: theme.colors.primaryColor,
      },
    },
  };
});
