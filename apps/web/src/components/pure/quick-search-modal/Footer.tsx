import { useTranslation } from '@affine/i18n';
import { PlusIcon } from '@blocksuite/icons';
import { assertEquals, uuidv4 } from '@blocksuite/store';
import { Command } from 'cmdk';
import { NextRouter } from 'next/router';
import React from 'react';

import { useBlockSuiteWorkspaceHelper } from '../../../hooks/use-blocksuite-workspace-helper';
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

  return (
    <Command.Item
      data-testid="quick-search-add-new-page"
      onSelect={async () => {
        onClose();
        const id = uuidv4();
        const pageId = await createPage(id, query);
        assertEquals(pageId, id);
        router.push({
          pathname: '/workspace/[workspaceId]/[pageId]',
          query: {
            workspaceId: blockSuiteWorkspace.room,
            pageId,
          },
        });
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
