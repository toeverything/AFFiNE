import { useTranslation } from '@affine/i18n';
import type { PageBlockModel } from '@blocksuite/blocks';
import { PlusIcon } from '@blocksuite/icons';
import { assertEquals, nanoid } from '@blocksuite/store';
import { Command } from 'cmdk';
import type { NextRouter } from 'next/router';
import type React from 'react';

import { useBlockSuiteWorkspaceHelper } from '../../../hooks/use-blocksuite-workspace-helper';
import { useRouterHelper } from '../../../hooks/use-router-helper';
import type { BlockSuiteWorkspace } from '../../../shared';
import { StyledModalFooterContent } from './style';

export type FooterProps = {
  query: string;
  onClose: () => void;
  blockSuiteWorkspace: BlockSuiteWorkspace;
  router: NextRouter;
};

export const Footer: React.FC<FooterProps> = ({
  query,
  onClose,
  blockSuiteWorkspace,
  router,
}) => {
  const { createPage } = useBlockSuiteWorkspaceHelper(blockSuiteWorkspace);
  const { t } = useTranslation();
  const { jumpToPage } = useRouterHelper(router);
  const MAX_QUERY_SHOW_LENGTH = 20;
  const normalizedQuery =
    query.length > MAX_QUERY_SHOW_LENGTH
      ? query.slice(0, MAX_QUERY_SHOW_LENGTH) + '...'
      : query;
  return (
    <Command.Item
      data-testid="quick-search-add-new-page"
      onSelect={async () => {
        onClose();
        const id = nanoid();
        const page = await createPage(id, query);
        assertEquals(page.id, id);
        await jumpToPage(blockSuiteWorkspace.id, page.id);
        if (!query) {
          return;
        }
        const newPage = blockSuiteWorkspace.getPage(page.id);
        if (newPage) {
          const block = newPage.getBlockByFlavour(
            'affine:page'
          )[0] as PageBlockModel;
          if (block) {
            block.title.insert(query, 0);
          }
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
