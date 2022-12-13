import { Modal, ModalWrapper } from '@/ui/modal';
import {
  StyledContent,
  StyledModalHeader,
  StyledModalFooter,
  StyledModalDivider,
  StyledShortcut,
} from './style';
import Input from './input';
import Result from './content';
import QuickSearchFooter from './footer';
import { Command } from 'cmdk';
import { useEffect, useState } from 'react';
import { useModal } from '@/providers/global-modal-provider';
type TransitionsModalProps = {
  open: boolean;
  onClose: () => void;
};
const isMac = () => {
  return /macintosh|mac os x/i.test(navigator.userAgent);
};
export const QuickSearch = ({ open, onClose }: TransitionsModalProps) => {
  const [query, setQuery] = useState('');
  const { triggerQuickSearchModal } = useModal();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && e.metaKey) {
        const selection = window.getSelection();
        if (selection?.toString()) {
          triggerQuickSearchModal(false);
          return;
        }
        if (selection?.isCollapsed) {
          triggerQuickSearchModal(!open);
        }
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} wrapperPosition={['top', 'center']}>
      <ModalWrapper
        width={620}
        height={'auto'}
        style={{
          maxHeight: '720px',
          minHeight: '350px',
          borderRadius: '20px',
          top: '138px',
        }}
      >
        <Command>
          <StyledModalHeader>
            <Input query={query} setQuery={setQuery} />
            <StyledShortcut>{isMac() ? '⌘+K' : 'Ctrl+K'}</StyledShortcut>
          </StyledModalHeader>
          <StyledModalDivider />
          <StyledContent>
            <Result query={query} />
          </StyledContent>

          <StyledModalFooter>
            <QuickSearchFooter />
          </StyledModalFooter>
        </Command>
      </ModalWrapper>
    </Modal>
  );
};

export default QuickSearch;
