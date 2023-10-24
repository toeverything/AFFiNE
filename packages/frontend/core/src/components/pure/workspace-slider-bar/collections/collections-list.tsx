import {
  MenuItem as SidebarMenuItem,
  MenuLinkItem as SidebarMenuLinkItem,
} from '@affine/component/app-sidebar';
import {
  filterPage,
  stopPropagation,
  useCollectionManager,
  useSavedCollections,
} from '@affine/component/page-list';
import {
  useEditCollection,
  useEditCollectionName,
} from '@affine/component/page-list';
import type { Collection, DeleteCollectionInfo } from '@affine/env/filter';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  DeleteIcon,
  EditIcon,
  FilterIcon,
  InformationIcon,
  MoreHorizontalIcon,
  ViewLayersIcon,
} from '@blocksuite/icons';
import type { PageMeta, Workspace } from '@blocksuite/store';
import type { DragEndEvent } from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import * as Collapsible from '@radix-ui/react-collapsible';
import { IconButton } from '@toeverything/components/button';
import {
  Menu,
  MenuIcon,
  MenuItem,
  type MenuItemProps,
} from '@toeverything/components/menu';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import type { ReactElement } from 'react';
import { useCallback, useMemo, useState } from 'react';
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
const CollectionOperations = ({
  view,
  showUpdateCollection,
  showUpdateCollectionName,
  setting,
  info,
}: {
  info: DeleteCollectionInfo;
  view: Collection;
  showUpdateCollection: () => void;
  showUpdateCollectionName: () => void;
  setting: ReturnType<typeof useCollectionManager>;
}) => {
  const t = useAFFiNEI18N();
  const actions = useMemo<
    Array<
      | {
          icon: ReactElement;
          name: string;
          click: () => void;
          type?: MenuItemProps['type'];
          element?: undefined;
        }
      | {
          element: ReactElement;
        }
    >
  >(
    () => [
      {
        icon: (
          <MenuIcon>
            <EditIcon />
          </MenuIcon>
        ),
        name: t['com.affine.collection.menu.rename'](),
        click: showUpdateCollectionName,
      },
      {
        icon: (
          <MenuIcon>
            <FilterIcon />
          </MenuIcon>
        ),
        name: t['com.affine.collection.menu.edit'](),
        click: showUpdateCollection,
      },
      {
        element: <div key="divider" className={styles.menuDividerStyle}></div>,
      },
      {
        icon: (
          <MenuIcon>
            <DeleteIcon />
          </MenuIcon>
        ),
        name: t['Delete'](),
        click: () => {
          return setting.deleteCollection(info, view.id);
        },
        type: 'danger',
      },
    ],
    [setting, info, showUpdateCollection, t, view]
  );
  return (
    <div style={{ minWidth: 150 }}>
      {actions.map(action => {
        if (action.element) {
          return action.element;
        }
        return (
          <MenuItem
            data-testid="collection-option"
            key={action.name}
            type={action.type}
            preFix={action.icon}
            onClick={action.click}
          >
            {action.name}
          </MenuItem>
        );
      })}
    </div>
  );
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
  const { setNodeRef, isOver } = useDroppable({
    id: `${Collections_DROP_AREA_PREFIX}${collection.id}`,
    data: {
      addToCollection: (id: string) => {
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
  const t = useAFFiNEI18N();
  const { open: openEditCollectionNameModal, node: editCollectionNameNode } =
    useEditCollectionName({
      title: t['com.affine.editCollection.renameCollection'](),
    });
  const showEditName = useCallback(() => {
    openEditCollectionNameModal(collection.name)
      .then(name => {
        return setting.updateCollection({ ...collection, name });
      })
      .catch(err => {
        console.error(err);
      });
  }, [setting.updateCollection, collection, openEditCollectionNameModal]);
  const { open: openEditCollectionModal, node: editCollectionNode } =
    useEditCollection(config);
  const showEdit = useCallback(() => {
    openEditCollectionModal(collection)
      .then(collection => {
        return setting.updateCollection(collection);
      })
      .catch(err => {
        console.error(err);
      });
  }, [setting, collection, openEditCollectionModal]);
  const allowList = useMemo(
    () => new Set(collection.allowList),
    [collection.allowList]
  );
  const removeFromAllowList = useCallback(
    (id: string) => {
      return setting.updateCollection({
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
      {editCollectionNameNode}
      {editCollectionNode}
      <SidebarMenuLinkItem
        data-testid="collection-item"
        data-type="collection-list-item"
        ref={setNodeRef}
        onCollapsedChange={setCollapsed}
        active={isOver || currentPath === path}
        icon={<ViewLayersIcon />}
        to={path}
        postfix={
          <div onClick={stopPropagation}>
            <Menu
              items={
                <CollectionOperations
                  info={info}
                  view={collection}
                  showUpdateCollection={showEdit}
                  showUpdateCollectionName={showEditName}
                  setting={setting}
                />
              }
            >
              <IconButton
                data-testid="collection-options"
                type="plain"
                withoutHoverStyle
              >
                <MoreHorizontalIcon />
              </IconButton>
            </Menu>
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
