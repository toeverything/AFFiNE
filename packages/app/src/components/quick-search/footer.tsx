import React from 'react';
import { MiddleAddIcon } from '@blocksuite/icons';
import { StyledModalFooterContent } from './style';
import { useEditor } from '@/providers/editor-provider';
import { IconButton } from '@/ui/button';

const QuickSearchFooter = () => {
  const { createPage } = useEditor();
  return (
    <StyledModalFooterContent>
      <IconButton>
        <MiddleAddIcon
          onClick={() => {
            createPage();
          }}
        />
      </IconButton>
      <span>New page</span>
    </StyledModalFooterContent>
  );
};

export default QuickSearchFooter;
