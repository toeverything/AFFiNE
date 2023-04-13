import { Modal, ModalWrapper } from '@affine/component';
import { getEnvironment } from '@affine/env';
import { useTranslation } from '@affine/i18n';
import { Command } from 'cmdk';
import type { NextRouter } from 'next/router';
import type React from 'react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';

import type { BlockSuiteWorkspace } from '../../../shared';
import { Footer } from './Footer';
import { NavigationPath } from './navigation-path';
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

const isMac = () => {
  const env = getEnvironment();
  return env.isBrowser && env.isMacOs;
};

export type QuickSearchModalProps = {
  blockSuiteWorkspace: BlockSuiteWorkspace;
  open: boolean;
  setOpen: (value: boolean) => void;
  router: NextRouter;
};

export const QuickSearchModal: React.FC<QuickSearchModalProps> = ({
  open,
  setOpen,
  router,
  blockSuiteWorkspace,
}) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, startTransition] = useTransition();
  const [query, _setQuery] = useState('');
  const setQuery = useCallback((query: string) => {
    startTransition(() => {
      _setQuery(query);
    });
  }, []);
  const isPublicWorkspace = useMemo(
    () => router.pathname.startsWith('/public-workspace'),
    [router]
  );
  const [publishWorkspaceName, setPublishWorkspaceName] = useState('');
  const [showCreatePage, setShowCreatePage] = useState(true);
  const isPublicAndNoQuery = useCallback(() => {
    return isPublicWorkspace && query.length === 0;
  }, [isPublicWorkspace, query.length]);
  const handleClose = useCallback(() => {
    setOpen(false);
  }, [setOpen]);
  // Add  ‘⌘+K’ shortcut keys as switches
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if ((e.key === 'k' && e.metaKey) || (e.key === 'k' && e.ctrlKey)) {
        const selection = window.getSelection();
        // prevent search bar focus in firefox
        e.preventDefault();
        setQuery('');
        if (selection?.toString()) {
          setOpen(false);
          return;
        }
        setOpen(!open);
      }
    };
    document.addEventListener('keydown', keydown, { capture: true });
    return () =>
      document.removeEventListener('keydown', keydown, { capture: true });
  }, [open, router, setOpen, setQuery]);
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
        width={608}
        style={{
          maxHeight: '80vh',
          minHeight: isPublicAndNoQuery() ? '72px' : '412px',
          top: '80px',
          overflow: 'hidden',
        }}
      >
        <NavigationPath
          blockSuiteWorkspace={blockSuiteWorkspace}
          onJumpToPage={() => {
            setOpen(false);
          }}
        />
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
                isPublicWorkspace
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
              {!isPublicWorkspace ? (
                <Results
                  query={query}
                  onClose={handleClose}
                  router={router}
                  blockSuiteWorkspace={blockSuiteWorkspace}
                  setShowCreatePage={setShowCreatePage}
                />
              ) : (
                <PublishedResults
                  blockSuiteWorkspace={blockSuiteWorkspace}
                  query={query}
                  loading={loading}
                  onClose={handleClose}
                  setPublishWorkspaceName={setPublishWorkspaceName}
                  data-testid="published-search-results"
                />
              )}
            </StyledContent>
            {!isPublicWorkspace ? (
              showCreatePage ? (
                <>
                  <StyledModalDivider />
                  <StyledModalFooter>
                    <Footer
                      query={query}
                      onClose={handleClose}
                      blockSuiteWorkspace={blockSuiteWorkspace}
                      router={router}
                    />
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

export default QuickSearchModal;
