import { useTranslation } from '@affine/i18n';
import { PlusIcon } from '@blocksuite/icons';
import { Command } from 'cmdk';
import React from 'react';

import { usePageHelper } from '@/hooks/use-page-helper';

import { StyledModalFooterContent } from './style';
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
        <PlusIcon />
        {query ? (
          <span>{t('New Keyword Page', { query: query })}</span>
        ) : (
          <span>{t('New Page')}</span>
        )}
      </StyledModalFooterContent>
    </Command.Item>
  );
};
