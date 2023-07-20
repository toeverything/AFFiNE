import { initEmptyPage } from '@affine/env/blocksuite';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { PageBlockModel } from '@blocksuite/blocks';
import { assertEquals } from '@blocksuite/global/utils';
import { PlusIcon } from '@blocksuite/icons';
import { nanoid } from '@blocksuite/store';
import { useBlockSuiteWorkspaceHelper } from '@toeverything/hooks/use-block-suite-workspace-helper';
import { Command } from 'cmdk';
import type React from 'react';
import { useCallback } from 'react';

import { useNavigateHelper } from '../../../hooks/use-navigate-helper';
import type { BlockSuiteWorkspace } from '../../../shared';
import { StyledModalFooterContent } from './style';

export type FooterProps = {
  query: string;
  onClose: () => void;
  blockSuiteWorkspace: BlockSuiteWorkspace;
};

export const Footer: React.FC<FooterProps> = ({
  query,
  onClose,
  blockSuiteWorkspace,
}) => {
  const { createPage } = useBlockSuiteWorkspaceHelper(blockSuiteWorkspace);
  const t = useAFFiNEI18N();
  const { jumpToPage } = useNavigateHelper();
  const MAX_QUERY_SHOW_LENGTH = 20;
  const normalizedQuery =
    query.length > MAX_QUERY_SHOW_LENGTH
      ? query.slice(0, MAX_QUERY_SHOW_LENGTH) + '...'
      : query;
  return (
    <Command.Item
      data-testid="quick-search-add-new-page"
      onSelect={useCallback(async () => {
        const id = nanoid();
        const page = createPage(id);
        assertEquals(page.id, id);
        await initEmptyPage(page);
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
        jumpToPage(blockSuiteWorkspace.id, page.id);
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
