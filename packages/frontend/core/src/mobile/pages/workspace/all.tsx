import { useThemeColorV2, Wrapper } from '@affine/component';
import { EmptyDocs } from '@affine/core/components/affine/empty';
import {
  createDocExplorerContext,
  DocExplorerContext,
} from '@affine/core/components/explorer/context';
import { DocsExplorer } from '@affine/core/components/explorer/docs-view/docs-list';
import { CollectionRulesService } from '@affine/core/modules/collection-rules';
import { useLiveData, useService } from '@toeverything/infra';
import { useEffect, useState } from 'react';

import { Page } from '../../components/page';
import { AllDocsHeader } from '../../views';

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
  const groups = useLiveData(explorerContextValue.groups$);
  const isEmpty =
    groups.length === 0 ||
    (groups.length && groups.every(group => !group.items.length));

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
    return (
      <>
        <EmptyDocs absoluteCenter />
        <Wrapper height={0} flexGrow={1} />
      </>
    );
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
