import React from 'react';
import { AddIcon } from '@blocksuite/icons';
import { StyledModalFooterContent } from './style';
import { useModal } from '@/providers/global-modal-provider';
import { useAppState } from '@/providers/app-state-provider/context';
import { Command } from 'cmdk';
import { useGoToPage } from '@/providers/app-state-provider/hooks';

export const Footer = (props: { query: string }) => {
  const { createPage } = useAppState();
  const { triggerQuickSearchModal } = useModal();
  const goToPage = useGoToPage();
  const query = props.query;

  return (
    <Command.Item
      data-testid="quickSearch-addNewPage"
      onSelect={async () => {
        const pageId = await createPage();
        if (pageId) {
          goToPage(pageId);
        }

        triggerQuickSearchModal();
      }}
    >
      <StyledModalFooterContent>
        <AddIcon />
        {query ? (
          <span>New &quot;{query}&quot; page</span>
        ) : (
          <span>New page</span>
        )}
      </StyledModalFooterContent>
    </Command.Item>
  );
};
