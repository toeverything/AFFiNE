import { styled } from '@/styles';
import { Modal, ModalWrapper, ModalCloseButton } from '@/ui/modal';
import { Button } from '@/ui/button';
import { useState } from 'react';
import Input from '@/ui/input';
import { KeyboardEvent } from 'react';
import { useTranslation } from '@affine/i18n';
import { useWorkspaceHelper } from '@/hooks/use-workspace-helper';
import { useRouter } from 'next/router';
import { toast } from '@/ui/toast';

interface ModalProps {
  open: boolean;
  onClose: () => void;
}

export const CreateWorkspaceModal = ({ open, onClose }: ModalProps) => {
  const [workspaceName, setWorkspaceName] = useState('');
  const [loading, setLoading] = useState(false);
  const { createWorkspace } = useWorkspaceHelper();
  const router = useRouter();
  const handleCreateWorkspace = async () => {
    setLoading(true);
    const workspace = await createWorkspace(workspaceName);

    if (workspace && workspace.id) {
      setLoading(false);
      router.replace(`/workspace/${workspace.id}`);
      onClose();
    } else {
      toast('create error');
    }
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      // 👇 Get input value
      handleCreateWorkspace();
    }
  };
  const { t } = useTranslation();
  return (
    <div>
      <Modal open={open} onClose={onClose}>
        <ModalWrapper width={560} height={342} style={{ padding: '10px' }}>
          <Header>
            <ModalCloseButton
              top={6}
              right={6}
              onClick={() => {
                onClose();
              }}
            />
          </Header>
          <Content>
            <ContentTitle>{t('New Workspace')}</ContentTitle>
            <p>
              Workspace is your virtual space to capture, create and plan as
              just one person or together as a team.
            </p>
            <Input
              onKeyDown={handleKeyDown}
              placeholder={'Set a Workspace name'}
              onChange={value => {
                setWorkspaceName(value);
              }}
            ></Input>
            <Button
              disabled={!workspaceName}
              style={{
                width: '260px',
                textAlign: 'center',
                marginTop: '16px',
                opacity: !workspaceName ? 0.5 : 1,
              }}
              loading={loading}
              type="primary"
              onClick={() => {
                handleCreateWorkspace();
              }}
            >
              {t('Create')}
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

const Content = styled('div')(({ theme }) => {
  return {
    padding: '0 84px',
    textAlign: 'center',
    fontSize: '18px',
    lineHeight: '26px',
    color: theme.colors.inputColor,
    p: {
      marginTop: '12px',
      marginBottom: '16px',
    },
  };
});

const ContentTitle = styled('div')(() => {
  return {
    fontSize: '20px',
    lineHeight: '28px',
    fontWeight: 600,
    textAlign: 'center',
    paddingBottom: '16px',
  };
});

// const Footer = styled('div')({
//   height: '70px',
//   paddingLeft: '24px',
//   marginTop: '32px',
//   textAlign: 'center',
// });
