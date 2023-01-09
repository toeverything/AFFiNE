import React from 'react';
import { AddIcon } from '@blocksuite/icons';
import { StyledModalFooterContent } from './style';
import { useModal } from '@/providers/GlobalModalProvider';
import { Command } from 'cmdk';
import { usePageHelper } from '@/hooks/use-page-helper';
import { useTranslation } from 'react-i18next';
export const Footer = (props: { query: string }) => {
  const { triggerQuickSearchModal } = useModal();
  const { openPage, createPage } = usePageHelper();
  const { t } = useTranslation();
  const query = props.query;

  return (
    <Command.Item
      data-testid="quickSearch-addNewPage"
      onSelect={async () => {
        const pageId = await createPage({ title: query });
        if (pageId) {
          openPage(pageId);
        }

        triggerQuickSearchModal();
      }}
    >
      <StyledModalFooterContent>
        <AddIcon />
        {query ? (
          <span>{t('New Keyword Page', { query: query })}</span>
        ) : (
          <span>{t('New Page')}</span>
        )}
      </StyledModalFooterContent>
    </Command.Item>
  );
};
