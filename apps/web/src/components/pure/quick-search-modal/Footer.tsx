import { useTranslation } from '@affine/i18n';
import type { PageBlockModel } from '@blocksuite/blocks';
import { PlusIcon } from '@blocksuite/icons';
import { assertEquals, assertExists, nanoid } from '@blocksuite/store';
import { Command } from 'cmdk';
import { NextRouter } from 'next/router';
import React from 'react';

import { useBlockSuiteWorkspaceHelper } from '../../../hooks/use-blocksuite-workspace-helper';
import { useRouterHelper } from '../../../hooks/use-router-helper';
import { BlockSuiteWorkspace } from '../../../shared';
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
  return (
    <Command.Item
      data-testid="quick-search-add-new-page"
      onSelect={async () => {
        onClose();
        const id = nanoid();
        const pageId = await createPage(id, query);
        assertEquals(pageId, id);
        await jumpToPage(blockSuiteWorkspace.id, pageId);
        if (!query) {
          return;
        }
        const newPage = blockSuiteWorkspace.getPage(pageId);
        if (newPage) {
          const block = newPage.getBlockByFlavour(
            'affine:page'
          )[0] as PageBlockModel;
          assertExists(block);
          block.title.insert(query, 0);
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
