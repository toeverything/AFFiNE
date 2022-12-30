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
import { getUaHelper } from '@/utils';
import { useAppState } from '@/providers/app-state-provider';
type TransitionsModalProps = {
  open: boolean;
  onClose: () => void;
};
const isMac = () => {
  return getUaHelper().isMacOs;
};
export const QuickSearch = ({ open, onClose }: TransitionsModalProps) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreatePage, setShowCreatePage] = useState(true);
  const { triggerQuickSearchModal } = useModal();
  const { currentWorkspaceId, workspacesMeta } = useAppState();

  const currentWorkspace = workspacesMeta.find(
    meta => String(meta.id) === String(currentWorkspaceId)
  );
  const isPublic = currentWorkspace?.public;

  // Add  ‘⌘+K’ shortcut keys as switches
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === 'k' && e.metaKey) || (e.key === 'k' && e.ctrlKey)) {
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
    document.addEventListener('keydown', down, { capture: true });
    return () =>
      document.removeEventListener('keydown', down, { capture: true });
  }, [open, triggerQuickSearchModal]);

  return (
    <Modal
      open={open}
      onClose={onClose}
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
            <Input query={query} setQuery={setQuery} setLoading={setLoading} />
            <StyledShortcut>{isMac() ? '⌘ + K' : 'Ctrl + K'}</StyledShortcut>
          </StyledModalHeader>
          <StyledModalDivider />
          <Command.List>
            <StyledContent>
              <Results
                query={query}
                loading={loading}
                setLoading={setLoading}
                setShowCreatePage={setShowCreatePage}
              />
            </StyledContent>
            {isPublic ? (
              <></>
            ) : showCreatePage ? (
              <>
                <StyledModalDivider />
                <StyledModalFooter>
                  <Footer query={query} />
                </StyledModalFooter>
              </>
            ) : null}
          </Command.List>
        </Command>
      </ModalWrapper>
    </Modal>
  );
};

export default QuickSearch;
