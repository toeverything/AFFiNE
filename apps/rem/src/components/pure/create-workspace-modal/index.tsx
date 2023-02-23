import { styled } from '@affine/component';
import { Modal, ModalCloseButton, ModalWrapper } from '@affine/component';
import { Button } from '@affine/component';
import { Input } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { useCallback, useRef, useState } from 'react';
import { KeyboardEvent } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}

export const CreateWorkspaceModal = ({
  open,
  onClose,
  onCreate,
}: ModalProps) => {
  const [workspaceName, setWorkspaceName] = useState('');
  const isComposition = useRef(false);
  const handleCreateWorkspace = useCallback(() => {
    onCreate(workspaceName);
  }, [onCreate, workspaceName]);
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter' && workspaceName && !isComposition.current) {
        handleCreateWorkspace();
      }
    },
    [handleCreateWorkspace, workspaceName]
  );
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
