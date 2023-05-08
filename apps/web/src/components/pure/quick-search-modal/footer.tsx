import { initPage } from '@affine/env/blocksuite';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { PageBlockModel } from '@blocksuite/blocks';
import { PlusIcon } from '@blocksuite/icons';
import { assertEquals, nanoid } from '@blocksuite/store';
import { useBlockSuiteWorkspaceHelper } from '@toeverything/hooks/use-block-suite-workspace-helper';
import { Command } from 'cmdk';
import type { NextRouter } from 'next/router';
import type React from 'react';
import { useCallback } from 'react';

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
  const t = useAFFiNEI18N();
  const { jumpToPage } = useRouterHelper(router);
  const MAX_QUERY_SHOW_LENGTH = 20;
  const normalizedQuery =
    query.length > MAX_QUERY_SHOW_LENGTH
      ? query.slice(0, MAX_QUERY_SHOW_LENGTH) + '...'
      : query;
  return (
    <Command.Item
      data-testid="quick-search-add-new-page"
      onSelect={useCallback(() => {
        const id = nanoid();
        const page = createPage(id);
        assertEquals(page.id, id);
        initPage(page);
        const block = page.getBlockByFlavour(
          'affine:page'
        )[0] as PageBlockModel;
        if (block) {
          block.title.insert(query, 0);
        } else {
          console.warn('No page block found');
        }
        blockSuiteWorkspace.setPageMeta(page.id, {
          title: query,
        });
        onClose();
        void jumpToPage(blockSuiteWorkspace.id, page.id);
      }, [blockSuiteWorkspace, createPage, jumpToPage, onClose, query])}
    >
      <StyledModalFooterContent>
        <PlusIcon />
        {query ? (
          <span>{t['New Keyword Page']({ query: normalizedQuery })}</span>
        ) : (
          <span>{t['New Page']()}</span>
        )}
      </StyledModalFooterContent>
    </Command.Item>
  );
};
