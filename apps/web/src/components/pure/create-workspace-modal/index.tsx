import {
  Button,
  Input,
  Modal,
  ModalCloseButton,
  ModalWrapper,
  styled,
} from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { KeyboardEvent } from 'react';
import { useCallback, useRef, useState } from 'react';

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
  const t = useAFFiNEI18N();
  return (
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
          <ContentTitle>{t['New Workspace']()}</ContentTitle>
          <p>{t['Workspace description']()}</p>
          <Input
            ref={ref => {
              if (ref) {
                setTimeout(() => ref.focus(), 0);
              }
            }}
            data-testid="create-workspace-input"
            onKeyDown={handleKeyDown}
            placeholder={t['Set a Workspace name']()}
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
            data-testid="create-workspace-button"
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
            {t['Create']()}
          </Button>
        </Content>
      </ModalWrapper>
    </Modal>
  );
};

const Header = styled('div')({
  position: 'relative',
  height: '44px',
});

const Content = styled('div')(() => {
  return {
    padding: '0 84px',
    textAlign: 'center',
    fontSize: '18px',
    lineHeight: '26px',
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
