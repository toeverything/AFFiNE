import React from 'react';
import { AddIcon } from '@blocksuite/icons';
import { StyledModalFooterContent } from './style';
import { useEditor } from '@/providers/editor-provider';
import { useModal } from '@/providers/global-modal-provider';
import { IconButton } from '@/ui/button';

const QuickSearchFooter = () => {
  const { createPage } = useEditor();
  const { triggerQuickSearchModal } = useModal();
  return (
    <StyledModalFooterContent>
      <IconButton>
        <AddIcon
          onClick={() => {
            createPage();
            triggerQuickSearchModal();
          }}
        />
      </IconButton>
      <span>New page</span>
    </StyledModalFooterContent>
  );
};

export default QuickSearchFooter;
