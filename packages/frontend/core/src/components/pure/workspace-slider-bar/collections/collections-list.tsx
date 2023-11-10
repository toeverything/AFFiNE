import { AnimatedCollectionsIcon, toast } from '@affine/component';
import {
  MenuItem as SidebarMenuItem,
  MenuLinkItem as SidebarMenuLinkItem,
} from '@affine/component/app-sidebar';
import {
  CollectionOperations,
  filterPage,
  stopPropagation,
  useCollectionManager,
  useSavedCollections,
} from '@affine/component/page-list';
import type { Collection, DeleteCollectionInfo } from '@affine/env/filter';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { InformationIcon, MoreHorizontalIcon } from '@blocksuite/icons';
import type { PageMeta, Workspace } from '@blocksuite/store';
import type { DragEndEvent } from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import * as Collapsible from '@radix-ui/react-collapsible';
import { IconButton } from '@toeverything/components/button';
import { useAsyncCallback } from '@toeverything/hooks/affine-async-hooks';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { collectionsCRUDAtom } from '../../../../atoms/collections';
import { useAllPageListConfig } from '../../../../hooks/affine/use-all-page-list-config';
import type { CollectionsListProps } from '../index';
import { Page } from './page';
import * as styles from './styles.css';

const Collections_DROP_AREA_PREFIX = 'collections-';
const isCollectionsDropArea = (id?: string | number) => {
  return typeof id === 'string' && id.startsWith(Collections_DROP_AREA_PREFIX);
};
export const processCollectionsDrag = (e: DragEndEvent) => {
  if (
    isCollectionsDropArea(e.over?.id) &&
    String(e.active.id).startsWith('page-list-item-')
  ) {
    e.over?.data.current?.addToCollection?.(e.active.data.current?.pageId);
  }
};

const CollectionRenderer = ({
  collection,
  pages,
  workspace,
  info,
}: {
  collection: Collection;
  pages: PageMeta[];
  workspace: Workspace;
  info: DeleteCollectionInfo;
}) => {
  const [collapsed, setCollapsed] = useState(true);
  const setting = useCollectionManager(collectionsCRUDAtom);
  const t = useAFFiNEI18N();
  const { setNodeRef, isOver } = useDroppable({
    id: `${Collections_DROP_AREA_PREFIX}${collection.id}`,
    data: {
      addToCollection: (id: string) => {
        if (collection.allowList.includes(id)) {
          toast(t['com.affine.collection.addPage.alreadyExists']());
          return;
        } else {
          toast(t['com.affine.collection.addPage.success']());
        }
        setting.addPage(collection.id, id).catch(err => {
          console.error(err);
        });
      },
    },
  });
  const config = useAllPageListConfig();
  const allPagesMeta = useMemo(
    () => Object.fromEntries(pages.map(v => [v.id, v])),
    [pages]
  );
  const allowList = useMemo(
    () => new Set(collection.allowList),
    [collection.allowList]
  );
  const removeFromAllowList = useAsyncCallback(
    async (id: string) => {
      await setting.updateCollection({
        ...collection,
        allowList: collection.allowList?.filter(v => v != id),
      });
    },
    [collection, setting]
  );
  const pagesToRender = pages.filter(
    page => filterPage(collection, page) && !page.trash
  );
  const location = useLocation();
  const currentPath = location.pathname.split('?')[0];
  const path = `/workspace/${workspace.id}/collection/${collection.id}`;
  return (
    <Collapsible.Root open={!collapsed}>
      <SidebarMenuLinkItem
        data-testid="collection-item"
        data-type="collection-list-item"
        ref={setNodeRef}
        onCollapsedChange={setCollapsed}
        active={isOver || currentPath === path}
        icon={<AnimatedCollectionsIcon closed={isOver} />}
        to={path}
        postfix={
          <div onClick={stopPropagation}>
            <CollectionOperations
              info={info}
              collection={collection}
              setting={setting}
              config={config}
            >
              <IconButton
                data-testid="collection-options"
                type="plain"
                withoutHoverStyle
              >
                <MoreHorizontalIcon />
              </IconButton>
            </CollectionOperations>
          </div>
        }
        collapsed={pagesToRender.length > 0 ? collapsed : undefined}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>{collection.name}</div>
        </div>
      </SidebarMenuLinkItem>
      <Collapsible.Content className={styles.collapsibleContent}>
        <div style={{ marginLeft: 20, marginTop: -4 }}>
          {pagesToRender.map(page => {
            return (
              <Page
                inAllowList={allowList.has(page.id)}
                removeFromAllowList={removeFromAllowList}
                allPageMeta={allPagesMeta}
                page={page}
                key={page.id}
                workspace={workspace}
              />
            );
          })}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};
export const CollectionsList = ({ workspace, info }: CollectionsListProps) => {
  const metas = useBlockSuitePageMeta(workspace);
  const { collections } = useSavedCollections(collectionsCRUDAtom);
  const t = useAFFiNEI18N();
  if (collections.length === 0) {
    return (
      <SidebarMenuItem
        data-testid="slider-bar-collection-null-description"
        icon={<InformationIcon />}
        disabled
      >
        <span>{t['Create a collection']()}</span>
      </SidebarMenuItem>
    );
  }
  return (
    <div data-testid="collections" className={styles.wrapper}>
      {collections.map(view => {
        return (
          <CollectionRenderer
            info={info}
            key={view.id}
            collection={view}
            pages={metas}
            workspace={workspace}
          />
        );
      })}
    </div>
  );
};
