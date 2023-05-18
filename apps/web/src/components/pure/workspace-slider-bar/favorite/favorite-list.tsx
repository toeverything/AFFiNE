import { MenuLinkItem } from '@affine/component/app-sidebar';
import { EdgelessIcon, PageIcon } from '@blocksuite/icons';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useAtomValue } from 'jotai';
import { useRouter } from 'next/router';
import { useMemo } from 'react';

import { workspacePreferredModeAtom } from '../../../../atoms';
import type { FavoriteListProps } from '../index';
import EmptyItem from './empty-item';
export const FavoriteList = ({ currentWorkspace }: FavoriteListProps) => {
  const router = useRouter();
  const record = useAtomValue(workspacePreferredModeAtom);
  const pageMeta = useBlockSuitePageMeta(currentWorkspace.blockSuiteWorkspace);
  const workspaceId = currentWorkspace.id;

  const favoriteList = useMemo(
    () => pageMeta.filter(p => p.favorite && !p.trash),
    [pageMeta]
  );

  return (
    <>
      {favoriteList.map((pageMeta, index) => {
        const active = router.query.pageId === pageMeta.id;
        const icon =
          record[pageMeta.id] === 'edgeless' ? <EdgelessIcon /> : <PageIcon />;
        return (
          <MenuLinkItem
            key={`${pageMeta}-${index}`}
            data-testid={`favorite-list-item-${pageMeta.id}`}
            active={active}
            href={`/workspace/${workspaceId}/${pageMeta.id}`}
            icon={icon}
          >
            <span>{pageMeta.title || 'Untitled'}</span>
          </MenuLinkItem>
        );
      })}
      {favoriteList.length === 0 && <EmptyItem />}
    </>
  );
};

export default FavoriteList;
