import { Modal, ModalWrapper } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { Command } from 'cmdk';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';

import { useModal } from '@/store/globalModal';
import { getUaHelper } from '@/utils';

import { Footer } from './Footer';
import { PublishedResults } from './PublishedResults';
import { Results } from './Results';
import { SearchInput } from './SearchInput';
import {
  StyledContent,
  StyledModalDivider,
  StyledModalFooter,
  StyledModalHeader,
  StyledShortcut,
} from './style';

type TransitionsModalProps = {
  open: boolean;
  onClose: () => void;
};

const isMac = () => {
  return getUaHelper().isMacOs;
};

// fixme(himself65): support ssr
export const QuickSearch = ({ open, onClose }: TransitionsModalProps) => {
  const router = useRouter();
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [publishWorkspaceName, setPublishWorkspaceName] = useState('');
  const [showCreatePage, setShowCreatePage] = useState(true);
  const { triggerQuickSearchModal } = useModal();
  const isPublicAndNoQuery = () => {
    return isPublic && query.length === 0;
  };
  const handleClose = () => {
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
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (open) {
      // Waiting for DOM rendering
      requestAnimationFrame(() => {
        const inputElement = inputRef.current;
        inputElement?.focus();
      });
    }
  }, [open]);

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
            <SearchInput
              ref={inputRef}
              onValueChange={value => {
                setQuery(value);
              }}
              onKeyDown={e => {
                // Avoid triggering the cmdk onSelect event when the input method is in use
                if (e.nativeEvent.isComposing) {
                  e.stopPropagation();
                  return;
                }
              }}
              placeholder={
                isPublic
                  ? t('Quick search placeholder2', {
                      workspace: publishWorkspaceName,
                    })
                  : t('Quick search placeholder')
              }
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
                  onClose={handleClose}
                  setShowCreatePage={setShowCreatePage}
                />
              ) : (
                <PublishedResults
                  query={query}
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
