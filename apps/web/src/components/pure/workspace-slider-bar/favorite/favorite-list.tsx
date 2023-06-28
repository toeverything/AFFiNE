import type { PageMeta } from '@blocksuite/store';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useMemo } from 'react';

import { ReferencePage } from '../components/reference-page';
import type { FavoriteListProps } from '../index';
import EmptyItem from './empty-item';

export const FavoriteList = ({ currentWorkspace }: FavoriteListProps) => {
  const metas = useBlockSuitePageMeta(currentWorkspace.blockSuiteWorkspace);

  const favoriteList = useMemo(
    () => metas.filter(p => p.favorite && !p.trash),
    [metas]
  );

  const metaMapping = useMemo(
    () =>
      metas.reduce((acc, meta) => {
        acc[meta.id] = meta;
        return acc;
      }, {} as Record<string, PageMeta>),
    [metas]
  );

  return (
    <>
      {favoriteList.map((pageMeta, index) => {
        return (
          <ReferencePage
            key={`${pageMeta}-${index}`}
            metaMapping={metaMapping}
            pageId={pageMeta.id}
            // memo?
            parentIds={new Set()}
            workspace={currentWorkspace.blockSuiteWorkspace}
          />
        );
      })}
      {favoriteList.length === 0 && <EmptyItem />}
    </>
  );
};

export default FavoriteList;
