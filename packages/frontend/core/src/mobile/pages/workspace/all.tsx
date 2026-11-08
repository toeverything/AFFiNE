import { useThemeColorV2 } from '@affine/component';
import { usePageHelper } from '@affine/core/blocksuite/block-suite-page-list/utils';
import {
  createDocExplorerContext,
  DocExplorerContext,
} from '@affine/core/components/explorer/context';
import { DocsExplorer } from '@affine/core/components/explorer/docs-view/docs-list';
import { CollectionRulesService } from '@affine/core/modules/collection-rules';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { inferOpenMode } from '@affine/core/utils';
import { useLiveData, useService } from '@toeverything/infra';
import { type MouseEvent, useCallback, useEffect, useState } from 'react';

import { Page } from '../../components/page';
import { AllDocsHeader, MobileAllDocsEmptyState } from '../../views';

const AllDocs = () => {
  const [explorerContextValue] = useState(() =>
    createDocExplorerContext({
      quickFavorite: false,
      showDocIcon: false,
      displayProperties: [
        'system:createdAt',
        'system:updatedAt',
        'system:tags',
      ],
      view: 'masonry',
      showDragHandle: false,
      groupBy: undefined,
      orderBy: undefined,
    })
  );
  const collectionRulesService = useService(CollectionRulesService);
  const workspace = useService(WorkspaceService).workspace;
  const pageHelper = usePageHelper(workspace.docCollection);
  const groups = useLiveData(explorerContextValue.groups$);
  const isEmpty =
    groups.length === 0 ||
    (groups.length && groups.every(group => !group.items.length));

  const handleCreateDoc = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      pageHelper.createPage(undefined, {
        at: inferOpenMode(event),
      });
    },
    [pageHelper]
  );

  useEffect(() => {
    const subscription = collectionRulesService
      .watch({
        filters: [
          { type: 'system', key: 'trash', method: 'is', value: 'false' },
        ],
        extraFilters: [
          { type: 'system', key: 'trash', method: 'is', value: 'false' },
          {
            type: 'system',
            key: 'empty-journal',
            method: 'is',
            value: 'false',
          },
        ],
        orderBy: {
          type: 'system',
          key: 'updatedAt',
          desc: true,
        },
      })
      .subscribe({
        next: result => {
          explorerContextValue.groups$.next(result.groups);
        },
        error: console.error,
      });
    return () => subscription.unsubscribe();
  }, [collectionRulesService, explorerContextValue.groups$]);

  if (isEmpty) {
    return <MobileAllDocsEmptyState type="docs" onAction={handleCreateDoc} />;
  }

  return (
    <DocExplorerContext.Provider value={explorerContextValue}>
      <DocsExplorer masonryItemWidthMin={150} />
    </DocExplorerContext.Provider>
  );
};

export const Component = () => {
  useThemeColorV2('layer/background/mobile/primary');

  return (
    <Page header={<AllDocsHeader />} tab>
      <AllDocs />
    </Page>
  );
};
