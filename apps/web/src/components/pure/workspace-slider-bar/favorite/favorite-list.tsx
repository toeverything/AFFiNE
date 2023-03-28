import { MuiCollapse } from '@affine/component';
import { EdgelessIcon, PageIcon } from '@blocksuite/icons';
import { useAtomValue } from 'jotai';
import { useRouter } from 'next/router';
import { useMemo } from 'react';

import { workspacePreferredModeAtom } from '../../../../atoms';
import type { FavoriteListProps } from '../index';
import { StyledCollapseItem } from '../shared-styles';
import EmptyItem from './empty-item';
export const FavoriteList = ({
  pageMeta,
  openPage,
  showList,
}: FavoriteListProps) => {
  const router = useRouter();
  const record = useAtomValue(workspacePreferredModeAtom);

  const favoriteList = useMemo(
    () => pageMeta.filter(p => p.favorite && !p.trash),
    [pageMeta]
  );

  return (
    <MuiCollapse
      in={showList}
      style={{
        maxHeight: 300,
        overflowY: 'auto',
        marginLeft: '16px',
      }}
    >
      {favoriteList.map((pageMeta, index) => {
        const active = router.query.pageId === pageMeta.id;
        return (
          <div key={`${pageMeta}-${index}`}>
            <StyledCollapseItem
              data-testid={`favorite-list-item-${pageMeta.id}`}
              active={active}
              ref={ref => {
                if (ref && active) {
                  ref.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              onClick={() => {
                if (active) {
                  return;
                }
                openPage(pageMeta.id);
              }}
            >
              {record[pageMeta.id] === 'edgeless' ? (
                <EdgelessIcon />
              ) : (
                <PageIcon />
              )}
              {pageMeta.title || 'Untitled'}
            </StyledCollapseItem>
          </div>
        );
      })}
      {favoriteList.length === 0 && <EmptyItem />}
    </MuiCollapse>
  );
};

export default FavoriteList;
