import React from 'react';
import { AddIcon } from '@blocksuite/icons';
import { StyledModalFooterContent } from './style';
import { useEditor } from '@/providers/editor-provider';
import { useModal } from '@/providers/global-modal-provider';

export const Footer = () => {
  const { createPage, getPageMeta, openPage } = useEditor();
  const { triggerQuickSearchModal } = useModal();
  return (
    <StyledModalFooterContent
      onClick={async () => {
        const page = createPage();
        const pageMeta = getPageMeta((await page).id);
        pageMeta && openPage(pageMeta.id);
        triggerQuickSearchModal();
      }}
    >
      <AddIcon />
      <span>New page</span>
    </StyledModalFooterContent>
  );
};
