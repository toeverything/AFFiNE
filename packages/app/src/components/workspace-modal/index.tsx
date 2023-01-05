import { styled } from '@/styles';
import { Modal, ModalWrapper, ModalCloseButton } from '@/ui/modal';
import { Button } from '@/ui/button';
import { useEffect, useState } from 'react';
import {
  getWorkspaces,
  Workspace,
  setActiveWorkspace,
  Login,
  User,
  getUserInfo,
  SignOut,
} from '@/hooks/mock-data/mock';
import { CreateWorkspaceModal } from '../create-workspace';
import { useConfirm } from '@/providers/confirm-provider';
import { toast } from '@/ui/toast';

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

export const WorkspaceModal = ({ open, onClose }: LoginModalProps) => {
  const [workspaceList, setWorkspaceList] = useState<Workspace[]>([]);
  const [user, setUser] = useState<User | null>();
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const { confirm } = useConfirm();
  useEffect(() => {
    setList();
    setUserInfo();
  }, []);

  const setList = () => {
    const data = getWorkspaces();
    setWorkspaceList(data);
  };
  const setUserInfo = () => {
    const data = getUserInfo();
    setUser(data);
  };
  return (
    <div>
      <Modal open={open} onClose={onClose}>
        <ModalWrapper
          width={620}
          height={334}
          style={{ padding: '10px', display: 'flex', flexDirection: 'column' }}
        >
          <Header>
            <ContentTitle>My Workspace List</ContentTitle>
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
              {workspaceList.map(item => {
                return (
                  <WorkspaceItem
                    onClick={() => {
                      setActiveWorkspace(item);
                      onClose();
                    }}
                    key={item.id}
                  >
                    <span>{item.name}</span>/
                    {item.type === 'local' && <b>local</b>}
                    {item.type === 'join' && <b>join</b>}/
                    {item.isPublish ? 'isPublish' : 'isPrivate'}/
                    {item.isLocal ? 'isLocal' : ''}/
                  </WorkspaceItem>
                );
              })}
              <li>
                <Button
                  type="primary"
                  onClick={() => {
                    setCreateWorkspaceOpen(true);
                  }}
                >
                  Create Workspace
                </Button>
              </li>
            </WorkspaceList>
          </Content>
          <Footer>
            {!user ? (
              <Button
                onClick={() => {
                  Login();
                  toast('login success');
                  setUserInfo();
                }}
              >
                Sign in AFFiNE Cloud
              </Button>
            ) : (
              <Button
                onClick={() => {
                  SignOut();
                  setUserInfo();
                }}
              >
                Sign out of AFFiNE Cloud
              </Button>
            )}
          </Footer>
          <CreateWorkspaceModal
            open={createWorkspaceOpen}
            onClose={() => {
              setCreateWorkspaceOpen(false);
              setList();
              onClose();
              confirm({
                title: 'Enable AFFiNE Cloud?',
                content: `If enabled, the data in this workspace will be backed up and synchronized via AFFiNE Cloud.`,
                confirmText: user ? 'Enable' : 'Sign in and Enable',
                cancelText: 'Skip',
              }).then(confirm => {
                if (user) {
                  console.log('enable cloud');
                } else {
                  confirm && Login();
                }
              });
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
  padding: '0 20px',
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

const Footer = styled('div')({
  height: '70px',
  paddingLeft: '24px',
  marginTop: '32px',
  textAlign: 'center',
});

const WorkspaceList = styled('div')({
  display: 'grid',
  gridRowGap: '10px',
  gridColumnGap: '10px',
  fontSize: '16px',
  gridTemplateColumns: 'repeat(2, 1fr)',
});

const WorkspaceItem = styled('div')({
  border: '1px solid #e5e5e5',
  padding: '10px',
  cursor: 'pointer',
  ':hover': {
    background: '#eee',
  },
});
