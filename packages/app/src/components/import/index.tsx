import { Modal, ModalWrapper, ModalCloseButton } from '@/ui/modal';
import { StyledButtonWrapper, StyledTitle } from './styles';
import { Button } from '@/ui/button';
import { Wrapper } from '@/ui/layout';
import { Loading } from '@/components/loading';
import { useEffect, useState } from 'react';
type ImportModalProps = {
  open: boolean;
  onClose: () => void;
};
export const ImportModal = ({ open, onClose }: ImportModalProps) => {
  const [status, setStatus] = useState<'unImported' | 'importing'>(
    'unImported'
  );

  useEffect(() => {
    if (status === 'importing') {
      setTimeout(() => {
        setStatus('unImported');
      }, 3000);
    }
  }, [status]);

  return (
    <Modal open={open} onClose={onClose}>
      <ModalWrapper width={460} height={240}>
        <ModalCloseButton onClick={onClose} />
        <StyledTitle>Import</StyledTitle>

        {status === 'unImported' && (
          <StyledButtonWrapper>
            <Button
              onClick={() => {
                setStatus('importing');
              }}
            >
              Markdown
            </Button>
            <Button
              onClick={() => {
                setStatus('importing');
              }}
            >
              HTML
            </Button>
          </StyledButtonWrapper>
        )}

        {status === 'importing' && (
          <Wrapper justifyContent="center" style={{ marginTop: 22 }}>
            <Loading size={25}></Loading>
          </Wrapper>
        )}
      </ModalWrapper>
    </Modal>
  );
};

export default ImportModal;
