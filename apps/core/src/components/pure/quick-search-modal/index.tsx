import { Modal, ModalWrapper } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { Command } from 'cmdk';
import { startTransition } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { AllWorkspace } from '../../../shared';
import { Footer } from './footer';
import { Results } from './results';
import { SearchInput } from './search-input';
import {
  StyledContent,
  StyledModalDivider,
  StyledModalFooter,
  StyledModalHeader,
  StyledShortcut,
} from './style';

export type QuickSearchModalProps = {
  workspace: AllWorkspace;
  open: boolean;
  setOpen: (value: boolean) => void;
};

export const QuickSearchModal: React.FC<QuickSearchModalProps> = ({
  open,
  setOpen,
  workspace,
}) => {
  const blockSuiteWorkspace = workspace?.blockSuiteWorkspace;
  const t = useAFFiNEI18N();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, _setQuery] = useState('');
  const setQuery = useCallback((query: string) => {
    startTransition(() => {
      _setQuery(query);
    });
  }, []);
  const [showCreatePage, setShowCreatePage] = useState(true);
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
  }, [open, setOpen, setQuery]);
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
          minHeight: '412px',
          top: '80px',
          overflow: 'hidden',
        }}
      >
        {/* <NavigationPath
          blockSuiteWorkspace={blockSuiteWorkspace}
          onJumpToPage={() => {
            setOpen(false);
          }}
        /> */}
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
              placeholder={t['Quick search placeholder']()}
            />
            <StyledShortcut>
              {environment.isBrowser && environment.isMacOs
                ? '⌘ + K'
                : 'Ctrl + K'}
            </StyledShortcut>
          </StyledModalHeader>
          <StyledModalDivider />
          <Command.List>
            <StyledContent>
              <Results
                query={query}
                onClose={handleClose}
                workspace={workspace}
                setShowCreatePage={setShowCreatePage}
              />
            </StyledContent>
            {showCreatePage ? (
              <>
                <StyledModalDivider />
                <StyledModalFooter>
                  <Footer
                    query={query}
                    onClose={handleClose}
                    blockSuiteWorkspace={blockSuiteWorkspace}
                  />
                </StyledModalFooter>
              </>
            ) : null}
          </Command.List>
        </Command>
      </ModalWrapper>
    </Modal>
  );
};

export default QuickSearchModal;
