import { styled } from '@/styles';
import { Modal, ModalWrapper, ModalCloseButton } from '@/ui/modal';
import { Button } from '@/ui/button';
import Input from '@/ui/input';
import { useState } from 'react';

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
  workSpaceName: string;
}

export const DeleteModal = ({
  open,
  onClose,
  workSpaceName,
}: LoginModalProps) => {
  const [canDelete, setCanDelete] = useState<boolean>(true);
  const InputChange = (value: string) => {
    if (value === workSpaceName) {
      setCanDelete(false);
    } else {
      setCanDelete(true);
    }
  };
  return (
    <div>
      <Modal open={open} onClose={onClose}>
        <ModalWrapper width={620} height={334}>
          <Header>
            <ModalCloseButton
              onClick={() => {
                onClose();
              }}
            />
          </Header>
          <Content>
            <ContentTitle>Delete Workspace</ContentTitle>
            <div>
              This action cannot be undone. This will permanently delete{' '}
              {workSpaceName} workspace name along with all its content.
            </div>

            <Input
              onChange={InputChange}
              placeholder="Please type “delete” to confirm"
            ></Input>
          </Content>
          <Footer>
            <Button
              style={{ marginRight: '12px' }}
              shape="circle"
              onClick={() => {
                onClose();
              }}
            >
              Cancel
            </Button>
            <Button shape="circle" type="danger" disabled={canDelete}>
              Delete
            </Button>
          </Footer>
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

const ContentTitle = styled('h1')({
  fontSize: '20px',
  lineHeight: '28px',
  fontWeight: 600,
  textAlign: 'center',
  paddingBottom: '16px',
});

const Footer = styled('div')({
  height: '70px',
  paddingLeft: '24px',
  marginTop: '32px',
  textAlign: 'center',
});
