import { useTranslation } from '@affine/i18n';
import { PlusIcon } from '@blocksuite/icons';
import { Command } from 'cmdk';
import React from 'react';

import { usePageHelper } from '@/hooks/use-page-helper';

import { StyledModalFooterContent } from './style';

const MAX_QUERY_SHOW_LENGTH = 20;

export const Footer = ({
  query,
  onClose,
}: {
  query: string;
  onClose: () => void;
}) => {
  const { openPage, createPage } = usePageHelper();
  const { t } = useTranslation();
  const normalizedQuery =
    query.length > MAX_QUERY_SHOW_LENGTH
      ? query.slice(0, MAX_QUERY_SHOW_LENGTH) + '...'
      : query;

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
          <span>{t('New Keyword Page', { query: normalizedQuery })}</span>
        ) : (
          <span>{t('New Page')}</span>
        )}
      </StyledModalFooterContent>
    </Command.Item>
  );
};
