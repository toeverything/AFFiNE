import { Modal, ModalWrapper } from '@/ui/modal';
import {
  StyledContent,
  StyledModalHeader,
  StyledModalFooter,
  StyledModalDivider,
  StyledShortcut,
} from './style';
import { Input } from './Input';
import { Results } from './Results';
import { Footer } from './Footer';
import { Command } from 'cmdk';
import { useEffect, useState } from 'react';
import { useModal } from '@/providers/GlobalModalProvider';
import { getUaHelper } from '@/utils';
import { useRouter } from 'next/router';
import { PublishedResults } from './PublishedResults';
type TransitionsModalProps = {
  open: boolean;
  onClose: () => void;
};
const isMac = () => {
  return getUaHelper().isMacOs;
};
export const QuickSearch = ({ open, onClose }: TransitionsModalProps) => {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [isPublic, setIsPublic] = useState(false);
  const [publishWorkspaceName, setPublishWorkspaceName] = useState('');
  const [showCreatePage, setShowCreatePage] = useState(true);
  const { triggerQuickSearchModal } = useModal();

  const handleClose = () => {
    setQuery('');
    onClose();
  };
  // Add  ‘⌘+K’ shortcut keys as switches
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === 'k' && e.metaKey) || (e.key === 'k' && e.ctrlKey)) {
        const selection = window.getSelection();
        setQuery('');
        if (selection?.toString()) {
          triggerQuickSearchModal(false);
          return;
        }
        if (selection?.isCollapsed) {
          triggerQuickSearchModal(!open);
        }
      }
    };
    document.addEventListener('keydown', down, { capture: true });
    return () =>
      document.removeEventListener('keydown', down, { capture: true });
  }, [open, triggerQuickSearchModal]);

  useEffect(() => {
    if (router.pathname.startsWith('/public-workspace')) {
      return setIsPublic(true);
    } else {
      return setIsPublic(false);
    }
  }, [router]);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      wrapperPosition={['top', 'center']}
      data-testid="quickSearch"
    >
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
            if (
              e.key === 'ArrowDown' ||
              e.key === 'ArrowUp' ||
              e.key === 'ArrowLeft' ||
              e.key === 'ArrowRight'
            ) {
              e.stopPropagation();
            }
          }}
        >
          <StyledModalHeader>
            <Input
              query={query}
              setQuery={setQuery}
              setLoading={setLoading}
              isPublic={isPublic}
              publishWorkspaceName={publishWorkspaceName}
            />
            <StyledShortcut>{isMac() ? '⌘ + K' : 'Ctrl + K'}</StyledShortcut>
          </StyledModalHeader>
          <StyledModalDivider />
          <Command.List>
            <StyledContent>
              {!isPublic ? (
                <Results
                  query={query}
                  loading={loading}
                  setLoading={setLoading}
                  onClose={handleClose}
                  setShowCreatePage={setShowCreatePage}
                />
              ) : (
                <PublishedResults
                  query={query}
                  loading={loading}
                  setLoading={setLoading}
                  onClose={handleClose}
                  setPublishWorkspaceName={setPublishWorkspaceName}
                />
              )}
            </StyledContent>
            {!isPublic ? (
              showCreatePage ? (
                <>
                  <StyledModalDivider />
                  <StyledModalFooter>
                    <Footer query={query} onClose={handleClose} />
                  </StyledModalFooter>
                </>
              ) : null
            ) : null}
          </Command.List>
        </Command>
      </ModalWrapper>
    </Modal>
  );
};

export default QuickSearch;
