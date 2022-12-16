import { Modal, ModalWrapper } from '@/ui/modal';
import {
  StyledContent,
  StyledModalHeader,
  StyledModalFooter,
  StyledModalDivider,
  StyledShortcut,
} from './style';
import { Input } from './input';
import { Results } from './results';
import { Footer } from './footer';
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
  const [loading, setLoading] = useState(true);
  const [showCreatePage, setShowCreatePage] = useState(true);
  const { triggerQuickSearchModal } = useModal();
  // Add  ‘⌘+K’ shortcut keys as switches
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
    if (!open) {
      setQuery('');
    }
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [open, triggerQuickSearchModal]);

  return (
    <Modal open={open} onClose={onClose} wrapperPosition={['top', 'center']}>
      <ModalWrapper
        width={620}
        style={{
          maxHeight: '80vh',
          minHeight: '350px',
          top: '12vh',
        }}
      >
        <Command
          shouldFilter={false}
          //Handle KeyboardEvent conflicts with blocksuite
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.stopPropagation();
            }
          }}
        >
          <StyledModalHeader>
            <Input query={query} setQuery={setQuery} setLoading={setLoading} />
            <StyledShortcut>{isMac() ? '⌘ + K' : 'Ctrl + K'}</StyledShortcut>
          </StyledModalHeader>
          <StyledModalDivider />
          <StyledContent>
            <Results
              query={query}
              loading={loading}
              setLoading={setLoading}
              setShowCreatePage={setShowCreatePage}
            />
          </StyledContent>
        </Command>
        {showCreatePage ? (
          <>
            <StyledModalDivider />
            <StyledModalFooter>
              <Footer query={query} />
            </StyledModalFooter>
          </>
        ) : null}
      </ModalWrapper>
    </Modal>
  );
};

export default QuickSearch;
