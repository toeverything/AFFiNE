import { Modal, ModalWrapper, ModalCloseButton } from '@/ui/modal';
import { StyledButtonWrapper, StyledTitle } from './styles';
import { Button } from '@/ui/button';
import { Wrapper, Content } from '@/ui/layout';
import Loading from '@/components/loading';
import { useEffect, useState } from 'react';
type ImportModalProps = {
  open: boolean;
  onClose: () => void;
};
export const ImportModal = ({ open, onClose }: ImportModalProps) => {
  const [status, setStatus] = useState<'unImported' | 'importing'>('importing');

  useEffect(() => {
    if (status === 'importing') {
      setTimeout(() => {
        setStatus('unImported');
      }, 1500);
    }
  }, [status]);

  return (
    <Modal open={open} onClose={onClose}>
      <ModalWrapper width={460} minHeight={240}>
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
          <Wrapper
            wrap={true}
            justifyContent="center"
            style={{ marginTop: 22, paddingBottom: '32px' }}
          >
            <Loading size={25}></Loading>
            <Content align="center" weight="500">
              OOOOPS! Sorry forgot to remind you that we are working on the
              import function
            </Content>
          </Wrapper>
        )}
      </ModalWrapper>
    </Modal>
  );
};

export default ImportModal;
