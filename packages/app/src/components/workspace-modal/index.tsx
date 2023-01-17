import { styled } from '@/styles';
import { Modal, ModalWrapper, ModalCloseButton } from '@/ui/modal';
import { IconButton } from '@/ui/button';
import { useState } from 'react';
import { CreateWorkspaceModal } from '../create-workspace';
import {
  CloudUnsyncedIcon,
  UsersIcon,
  AddIcon,
  LogOutIcon,
  CloudInsyncIcon,
} from '@blocksuite/icons';
import { toast } from '@/ui/toast';
import {
  WorkspaceAvatar,
  WorkspaceUnitAvatar,
} from '@/components/workspace-avatar';
import { useAppState } from '@/providers/app-state-provider';
import { useRouter } from 'next/router';
import { useConfirm } from '@/providers/ConfirmProvider';
import { useTranslation } from '@affine/i18n';
import { LanguageMenu } from './languageMenu';
import Loading from '@/components/loading';
import { Wrapper } from '@/ui/layout';
interface WorkspaceModalProps {
  open: boolean;
  onClose: () => void;
}

export const WorkspaceModal = ({ open, onClose }: WorkspaceModalProps) => {
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const { confirm } = useConfirm();
  const { workspaceList, currentWorkspace, login, user, logout, isOwner } =
    useAppState();
  const router = useRouter();
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState(true);
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
            <LanguageMenu />
            <ModalCloseButton
              top={6}
              right={6}
              onClick={() => {
                onClose();
              }}
            />
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
                            <CloudUnsyncedIcon fontSize={16} />
                            Local Workspace
                          </p>
                        ) : (
                          <p>
                            <CloudUnsyncedIcon fontSize={16} />
                            Cloud Workspace
                          </p>
                        )
                      ) : (
                        <p>
                          <UsersIcon fontSize={16} color={'#FF646B'} />
                          Joined Workspace
                        </p>
                      )}
                      {item.provider === 'local' && (
                        <p>
                          <UsersIcon fontSize={16} />
                          All data can be accessed offline
                        </p>
                      )}
                      {item.published && (
                        <p>
                          <UsersIcon fontSize={16} /> Published to Web
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
          <Footer>
            {!user ? (
              <StyleSignIn
                onClick={async () => {
                  setLoaded(false);
                  await login();
                  toast(t('login success'));
                  setLoaded(true);
                }}
              >
                <span>
                  <CloudInsyncIcon fontSize={16} />
                </span>
                Sign in to sync with AFFINE Cloud
              </StyleSignIn>
            ) : (
              <div style={{ display: 'flex' }}>
                <div>
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
                <div>
                  <IconButton
                    onClick={() => {
                      confirm({
                        title: 'Sign out?',

                        content: `All data has been stored in the cloud. `,
                        confirmText: 'Sign out',
                        cancelText: 'Cancel',
                      }).then(async confirm => {
                        if (confirm) {
                          if (user) {
                            await logout();
                            router.replace(`/workspace`);
                            toast('Enabled success');
                          }
                        }
                      });
                    }}
                  >
                    <LogOutIcon></LogOutIcon>
                  </IconButton>
                </div>
              </div>
            )}
            {!loaded && (
              <Wrapper justifyContent="center">
                <Loading size={25} />
              </Wrapper>
            )}
          </Footer>
          <CreateWorkspaceModal
            open={createWorkspaceOpen}
            onClose={() => {
              setCreateWorkspaceOpen(false);
            }}
          ></CreateWorkspaceModal>
        </ModalWrapper>
      </Modal>
    </div>
  );
};

const Header = styled('div')({
  position: 'relative',
  height: '44px',
});

const Content = styled('div')({
  flexDirection: 'column',
  alignItems: 'center',
  gap: '16px',
  flex: 1,
});

const ContentTitle = styled('span')({
  fontSize: '20px',
  lineHeight: '28px',
  fontWeight: 600,
  textAlign: 'left',
  paddingBottom: '16px',
});

const WorkspaceList = styled('div')({
  height: '500px',
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
      verticalAlign: 'sub',
      marginRight: '10px',
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
