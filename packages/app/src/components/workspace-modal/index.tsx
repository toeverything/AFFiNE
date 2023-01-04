import { styled } from '@/styles';
import { Modal, ModalWrapper, ModalCloseButton } from '@/ui/modal';
import { Button } from '@/ui/button';
import { useEffect, useState } from 'react';
import { getWorkspaceList, Workspace } from '@/hooks/mock-data/mock';
import { CreateWorkspaceModal } from '../create-workspace';

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

export const WorkspaceModal = ({ open, onClose }: LoginModalProps) => {
  const [workspaceList, setWorkspaceList] = useState<Workspace[]>([]);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);

  useEffect(() => {
    getList();
  }, []);

  const getList = () => {
    const data = getWorkspaceList();
    setWorkspaceList(data);
  };
  return (
    <div>
      <Modal open={open} onClose={onClose}>
        <ModalWrapper width={620} height={334} style={{ padding: '10px' }}>
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
                  <WorkspaceItem key={item.id}>
                    <span></span>
                    <span>{item.name}</span>/
                    {item.type === 'local' && <b>local</b>}
                    {item.type === 'share' && <b>share</b>}/
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
            <Button>Sign in AFFiNE Cloud</Button>
          </Footer>
          <CreateWorkspaceModal
            open={createWorkspaceOpen}
            onClose={() => {
              setCreateWorkspaceOpen(false);
              getList();
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
