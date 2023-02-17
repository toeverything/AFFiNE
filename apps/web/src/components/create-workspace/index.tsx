import { styled } from '@affine/component';
import { Modal, ModalCloseButton, ModalWrapper } from '@affine/component';
import { Button } from '@affine/component';
import { Input } from '@affine/component';
import { toast } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { useRouter } from 'next/router';
import { useRef, useState } from 'react';
import { KeyboardEvent } from 'react';

import { useWorkspaceHelper } from '@/hooks/use-workspace-helper';

interface ModalProps {
  open: boolean;
  onClose: () => void;
}

export const CreateWorkspaceModal = ({ open, onClose }: ModalProps) => {
  const [workspaceName, setWorkspaceName] = useState('');
  const [loading, setLoading] = useState(false);
  const { createWorkspace } = useWorkspaceHelper();
  const isComposition = useRef(false);
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
    if (event.key === 'Enter' && workspaceName && !isComposition.current) {
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
            <p>{t('Workspace description')}</p>
            <Input
              onKeyDown={handleKeyDown}
              placeholder={t('Set a Workspace name')}
              maxLength={15}
              minLength={0}
              onChange={value => {
                setWorkspaceName(value);
              }}
              onCompositionStart={() => {
                isComposition.current = true;
              }}
              onCompositionEnd={() => {
                isComposition.current = false;
              }}
            />
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
