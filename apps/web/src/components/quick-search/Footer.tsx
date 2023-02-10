import React from 'react';
import { AddIcon } from '@blocksuite/icons';
import { StyledModalFooterContent } from './style';
import { Command } from 'cmdk';
import { usePageHelper } from '@/hooks/use-page-helper';
import { useTranslation } from '@affine/i18n';
export const Footer = (props: { query: string; onClose: () => void }) => {
  const { openPage, createPage } = usePageHelper();
  const { t } = useTranslation();
  const { query, onClose } = props;

  return (
    <Command.Item
      data-testid="quickSearch-addNewPage"
      onSelect={async () => {
        onClose();
        const pageId = await createPage({ title: query });
        if (pageId) {
          openPage(pageId);
        }
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
