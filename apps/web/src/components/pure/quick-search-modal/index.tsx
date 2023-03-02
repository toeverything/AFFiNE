import { Modal, ModalWrapper } from '@affine/component';
import { getEnvironment } from '@affine/env';
import { Command } from 'cmdk';
import { NextRouter } from 'next/router';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from 'react';

import { BlockSuiteWorkspace } from '../../../shared';
import { Footer } from './Footer';
import { Input } from './Input';
import { PublishedResults } from './PublishedResults';
import { Results } from './Results';
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
  enableShortCut: boolean;
  open: boolean;
  setOpen: (value: boolean) => void;
  router: NextRouter;
};

export const QuickSearchModal: React.FC<QuickSearchModalProps> = ({
  open,
  setOpen,
  router,
  enableShortCut,
  blockSuiteWorkspace,
}) => {
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
    setQuery('');
    setOpen(false);
  }, [setOpen, setQuery]);
  // Add  ‘⌘+K’ shortcut keys as switches
  useEffect(() => {
    if (!enableShortCut) {
      return;
    }
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
        if (selection?.isCollapsed) {
          setOpen(!open);
        }
      }
    };
    document.addEventListener('keydown', keydown, { capture: true });
    return () =>
      document.removeEventListener('keydown', keydown, { capture: true });
  }, [enableShortCut, open, router, setOpen, setQuery]);

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
              isPublic={isPublicWorkspace}
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
              {!isPublicWorkspace ? (
                <Results
                  query={query}
                  loading={loading}
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
