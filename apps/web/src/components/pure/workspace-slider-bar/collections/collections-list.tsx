import { Menu } from '@affine/component';
import { MenuItem } from '@affine/component/app-sidebar';
import {
  EditCollectionModel,
  useAllPageSetting,
  useSavedCollections,
} from '@affine/component/page-list';
import type { Collection } from '@affine/env/filter';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  DeleteIcon,
  EdgelessIcon,
  FilterIcon,
  MoreHorizontalIcon,
  PageIcon,
  UnpinIcon,
  ViewLayersIcon,
} from '@blocksuite/icons';
import type { PageMeta, Workspace } from '@blocksuite/store';
import type { DragEndEvent } from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import * as Collapsible from '@radix-ui/react-collapsible';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useBlockSuitePageReferences } from '@toeverything/hooks/use-block-suite-page-references';
import { useAtomValue } from 'jotai';
import { useRouter } from 'next/router';
import type { ReactElement } from 'react';
import React, { useCallback, useMemo, useState } from 'react';

import { pageSettingFamily } from '../../../../atoms';
import { useBlockSuiteMetaHelper } from '../../../../hooks/affine/use-block-suite-meta-helper';
import type { AllWorkspace } from '../../../../shared';
import { filterPage } from '../../../../utils/filter';
import { ReferencePage } from '../components/reference-page';
import type { CollectionsListProps } from '../index';
import * as styles from './styles.css';

const PageOperations = ({
  page,
  inAllowList,
  addToExcludeList,
  removeFromAllowList,
  inExcludeList,
  workspace,
}: {
  workspace: Workspace;
  page: PageMeta;
  inAllowList: boolean;
  removeFromAllowList: (id: string) => void;
  inExcludeList: boolean;
  addToExcludeList: (id: string) => void;
}) => {
  const { removeToTrash } = useBlockSuiteMetaHelper(workspace);
  const actions = useMemo<
    Array<
      | {
          icon: ReactElement;
          name: string;
          click: () => void;
          className?: string;
          render?: undefined;
        }
      | {
          render: ReactElement;
        }
    >
  >(
    () => [
      ...(inAllowList
        ? [
            {
              icon: <FilterIcon />,
              name: 'Exclude from allow list',
              click: () => removeFromAllowList(page.id),
            },
          ]
        : []),
      ...(!inExcludeList
        ? [
            {
              icon: <FilterIcon />,
              name: 'Exclude from collection',
              click: () => addToExcludeList(page.id),
            },
          ]
        : []),
      {
        render: <div key="divider" className={styles.menuDividerStyle}></div>,
      },
      {
        icon: <DeleteIcon style={{ color: 'var(--affine-warning-color)' }} />,
        name: 'Delete',
        click: () => {
          removeToTrash(page.id);
        },
        className: styles.deleteFolder,
      },
    ],
    [
      inAllowList,
      inExcludeList,
      page.id,
      removeFromAllowList,
      addToExcludeList,
      removeToTrash,
    ]
  );
  return (
    <>
      {actions.map(action => {
        if (action.render) {
          return action.render;
        }
        return (
          <MenuItem
            key={action.name}
            className={action.className}
            icon={action.icon}
            onClick={action.click}
          >
            {action.name}
          </MenuItem>
        );
      })}
    </>
  );
};
const Page = ({
  page,
  workspace,
  allPageMeta,
  inAllowList,
  inExcludeList,
  removeFromAllowList,
  addToExcludeList,
}: {
  page: PageMeta;
  inAllowList: boolean;
  removeFromAllowList: (id: string) => void;
  inExcludeList: boolean;
  addToExcludeList: (id: string) => void;
  workspace: AllWorkspace;
  allPageMeta: Record<string, PageMeta>;
}) => {
  const [collapsed, setCollapsed] = React.useState(true);
  const router = useRouter();
  const t = useAFFiNEI18N();
  const pageId = page.id;
  const active = router.query.pageId === pageId;
  const setting = useAtomValue(pageSettingFamily(pageId));
  const icon = setting?.mode === 'edgeless' ? <EdgelessIcon /> : <PageIcon />;
  const references = useBlockSuitePageReferences(
    workspace.blockSuiteWorkspace,
    pageId
  );
  const clickPage = useCallback(() => {
    return router.push(`/workspace/${workspace.id}/${page.id}`);
  }, [page.id, router, workspace.id]);
  return (
    <Collapsible.Root open={!collapsed}>
      <MenuItem
        icon={icon}
        onClick={clickPage}
        className={styles.title}
        active={active}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        postfix={
          <Menu
            trigger="click"
            placement="bottom-start"
            content={
              <div style={{ width: 220 }}>
                <PageOperations
                  inAllowList={inAllowList}
                  removeFromAllowList={removeFromAllowList}
                  inExcludeList={inExcludeList}
                  addToExcludeList={addToExcludeList}
                  page={page}
                  workspace={workspace.blockSuiteWorkspace}
                />
              </div>
            }
          >
            <div className={styles.more}>
              <MoreHorizontalIcon></MoreHorizontalIcon>
            </div>
          </Menu>
        }
      >
        {page.title || t['Untitled']()}
      </MenuItem>
      <Collapsible.Content>
        <div style={{ marginLeft: 8 }}>
          {references
            .filter(id => !allPageMeta[id]?.trash)
            .map(id => {
              return (
                <ReferencePage
                  key={id}
                  workspace={workspace.blockSuiteWorkspace}
                  pageId={id}
                  metaMapping={allPageMeta}
                  parentIds={new Set([pageId])}
                />
              );
            })}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};
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
  showUpdateCollection: showUpdateCollection,
  setting,
}: {
  view: Collection;
  showUpdateCollection: () => void;
  setting: ReturnType<typeof useAllPageSetting>;
}) => {
  const actions = useMemo<
    Array<
      | {
          icon: ReactElement;
          name: string;
          click: () => void;
          className?: string;
          render?: undefined;
        }
      | {
          render: ReactElement;
        }
    >
  >(
    () => [
      {
        icon: <FilterIcon />,
        name: 'Edit Filter',
        click: showUpdateCollection,
      },
      {
        icon: <UnpinIcon />,
        name: 'Unpin',
        click: () => {
          return setting.updateCollection({
            ...view,
            pinned: false,
          });
        },
      },
      {
        render: <div key="divider" className={styles.menuDividerStyle}></div>,
      },
      {
        icon: <DeleteIcon style={{ color: 'var(--affine-warning-color)' }} />,
        name: 'Delete',
        click: () => {
          return setting.deleteCollection(view.id);
        },
        className: styles.deleteFolder,
      },
    ],
    [setting, showUpdateCollection, view]
  );
  return (
    <div style={{ minWidth: 150 }}>
      {actions.map(action => {
        if (action.render) {
          return action.render;
        }
        return (
          <MenuItem
            key={action.name}
            className={action.className}
            icon={action.icon}
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
  workspace: AllWorkspace;
}) => {
  const [collapsed, setCollapsed] = React.useState(true);
  const setting = useAllPageSetting();
  const router = useRouter();
  const clickCollection = useCallback(() => {
    router
      .push(`/workspace/${workspace.id}/all`)
      .then(() => {
        setting.selectCollection(collection.id);
      })
      .catch(err => {
        console.error(err);
      });
  }, [router, workspace.id, setting, collection.id]);
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
  const excludeList = useMemo(
    () => new Set(collection.excludeList),
    [collection.excludeList]
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
  const addToExcludeList = useCallback(
    (id: string) => {
      return setting.updateCollection({
        ...collection,
        excludeList: [id, ...(collection.excludeList ?? [])],
      });
    },
    [collection, setting]
  );
  return (
    <Collapsible.Root open={!collapsed}>
      <EditCollectionModel
        init={collection}
        onConfirm={setting.saveCollection}
        open={show}
        onClose={() => showUpdateCollection(false)}
      />
      <MenuItem
        ref={setNodeRef}
        onCollapsedChange={setCollapsed}
        active={isOver}
        icon={<ViewLayersIcon />}
        postfix={
          <Menu
            trigger="click"
            placement="bottom-start"
            content={
              <CollectionOperations
                view={collection}
                showUpdateCollection={() => showUpdateCollection(true)}
                setting={setting}
              />
            }
          >
            <div className={styles.more}>
              <MoreHorizontalIcon></MoreHorizontalIcon>
            </div>
          </Menu>
        }
        collapsed={collapsed}
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
      </MenuItem>
      <Collapsible.Content>
        <div style={{ marginLeft: 8 }}>
          {pages
            .filter(page => filterPage(collection, page) && !page.trash)
            .map(page => {
              return (
                <Page
                  inAllowList={allowList.has(page.id)}
                  removeFromAllowList={removeFromAllowList}
                  inExcludeList={excludeList.has(page.id)}
                  addToExcludeList={addToExcludeList}
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
export const CollectionsList = ({ currentWorkspace }: CollectionsListProps) => {
  const metas = useBlockSuitePageMeta(currentWorkspace.blockSuiteWorkspace);
  const { savedCollections } = useSavedCollections();

  return (
    <div className={styles.wrapper}>
      {savedCollections
        .filter(v => v.pinned)
        .map(view => {
          return (
            <CollectionRenderer
              key={view.id}
              collection={view}
              pages={metas}
              workspace={currentWorkspace}
            />
          );
        })}
    </div>
  );
};
