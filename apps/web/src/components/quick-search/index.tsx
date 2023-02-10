import { Modal, ModalWrapper } from '@affine/component';
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
import { useModal } from '@/store/globalModal';
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
  const isPublicAndNoQuery = () => {
    return isPublic && query.length === 0;
  };
  const handleClose = () => {
    setQuery('');
    onClose();
  };
  // Add  ‘⌘+K’ shortcut keys as switches
  useEffect(() => {
    if (router.pathname.startsWith('/404')) {
      return;
    }
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
  }, [open, router, triggerQuickSearchModal]);

  useEffect(() => {
    if (router.pathname.startsWith('/public-workspace')) {
      return setIsPublic(true);
    } else {
      return setIsPublic(false);
    }
  }, [router]);
  useEffect(() => {
    if (router.pathname.startsWith('/404')) {
      return onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          minHeight: isPublicAndNoQuery() ? '72px' : '350px',
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
              open={open}
              query={query}
              setQuery={setQuery}
              setLoading={setLoading}
              isPublic={isPublic}
              publishWorkspaceName={publishWorkspaceName}
            />
            <StyledShortcut>{isMac() ? '⌘ + K' : 'Ctrl + K'}</StyledShortcut>
          </StyledModalHeader>
          <StyledModalDivider
            style={{ display: isPublicAndNoQuery() ? 'none' : '' }}
          />
          <Command.List>
            <StyledContent
              style={{ display: isPublicAndNoQuery() ? 'none' : '' }}
            >
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
                  data-testid="publishedSearchResults"
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
