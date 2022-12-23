import React from 'react';
import { AddIcon } from '@blocksuite/icons';
import { StyledModalFooterContent } from './style';
import { useModal } from '@/providers/global-modal-provider';
import { useAppState } from '@/providers/app-state-provider';
import { Command } from 'cmdk';
import { usePageHelper } from '@/hooks/use-page-helper';

export const Footer = (props: { query: string }) => {
  const { createPage } = useAppState();
  const { triggerQuickSearchModal } = useModal();
  const { openPage } = usePageHelper();
  const query = props.query;

  return (
    <Command.Item
      data-testid="quickSearch-addNewPage"
      onSelect={async () => {
        const pageId = await createPage?.();
        if (pageId) {
          openPage(pageId);
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
