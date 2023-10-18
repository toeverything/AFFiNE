import { MenuItem as CollectionItem } from '@affine/component/app-sidebar';
import {
  EditCollectionModal,
  filterPage,
  useCollectionManager,
  useSavedCollections,
} from '@affine/component/page-list';
import type { Collection } from '@affine/env/filter';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  DeleteIcon,
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

import { collectionsCRUDAtom } from '../../../../atoms/collections';
import { useAllPageListConfig } from '../../../../hooks/affine/use-all-page-list-config';
import { useNavigateHelper } from '../../../../hooks/use-navigate-helper';
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
  setting,
}: {
  view: Collection;
  showUpdateCollection: () => void;
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
            <FilterIcon />
          </MenuIcon>
        ),
        name: t['Edit Filter'](),
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
          return setting.deleteCollection(view.id);
        },
        type: 'danger',
      },
    ],
    [setting, showUpdateCollection, t, view]
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
}: {
  collection: Collection;
  pages: PageMeta[];
  workspace: Workspace;
}) => {
  const [collapsed, setCollapsed] = useState(true);
  const setting = useCollectionManager(collectionsCRUDAtom);
  const { jumpToCollection } = useNavigateHelper();
  const clickCollection = useCallback(() => {
    jumpToCollection(workspace.id, collection.id);
  }, [jumpToCollection, workspace.id, collection.id]);
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
  const allPagesMeta = useMemo(
    () => Object.fromEntries(pages.map(v => [v.id, v])),
    [pages]
  );
  const [show, showUpdateCollection] = useState(false);
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
  const config = useAllPageListConfig();
  return (
    <Collapsible.Root open={!collapsed}>
      <EditCollectionModal
        allPageListConfig={config}
        init={collection}
        onConfirm={setting.updateCollection}
        open={show}
        onOpenChange={showUpdateCollection}
      />
      <CollectionItem
        data-testid="collection-item"
        data-type="collection-list-item"
        ref={setNodeRef}
        onCollapsedChange={setCollapsed}
        active={isOver}
        icon={<ViewLayersIcon />}
        postfix={
          <Menu
            items={
              <CollectionOperations
                view={collection}
                showUpdateCollection={() => showUpdateCollection(true)}
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
        }
        collapsed={pagesToRender.length > 0 ? collapsed : undefined}
        onClick={clickCollection}
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
      </CollectionItem>
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
export const CollectionsList = ({ workspace }: CollectionsListProps) => {
  const metas = useBlockSuitePageMeta(workspace);
  const { collections } = useSavedCollections(collectionsCRUDAtom);
  const t = useAFFiNEI18N();
  if (collections.length === 0) {
    return (
      <CollectionItem
        data-testid="slider-bar-collection-null-description"
        icon={<InformationIcon />}
        disabled
      >
        <span>{t['Create a collection']()}</span>
      </CollectionItem>
    );
  }
  return (
    <div data-testid="collections" className={styles.wrapper}>
      {collections.map(view => {
        return (
          <CollectionRenderer
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
