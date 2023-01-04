import { styled } from '@/styles';
import { Modal, ModalWrapper, ModalCloseButton } from '@/ui/modal';
import { Button } from '@/ui/button';
import { useState } from 'react';
import { createWorkspace } from '@/hooks/mock-data/mock';
import Input from '@/ui/input';

interface ModalProps {
  open: boolean;
  onClose: () => void;
}

export const CreateWorkspaceModal = ({ open, onClose }: ModalProps) => {
  const [workspaceName, setWorkspaceName] = useState('');
  const handleCreateWorkspace = () => {
    createWorkspace(workspaceName);
    onClose();
  };
  return (
    <div>
      <Modal open={open} onClose={onClose}>
        <ModalWrapper width={620} height={334} style={{ padding: '10px' }}>
          <Header>
            <ContentTitle>New Workspace</ContentTitle>
            <ModalCloseButton
              top={6}
              right={6}
              onClick={() => {
                onClose();
              }}
            />
          </Header>
          <Content>
            <p>
              Workspace is your virtual space to capture, create and plan as
              just one person or together as a team.
            </p>
            <Input
              onChange={value => {
                setWorkspaceName(value);
              }}
            ></Input>
            <Button
              onClick={() => {
                handleCreateWorkspace();
              }}
            >
              Create
            </Button>
          </Content>
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
  display: 'flex',
  padding: '0 48px',
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
