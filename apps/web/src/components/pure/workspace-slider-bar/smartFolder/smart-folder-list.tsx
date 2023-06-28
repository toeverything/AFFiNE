import { Menu } from '@affine/component';
import { MenuItem, MenuLinkItem } from '@affine/component/app-sidebar';
import {
  EditViewModel,
  useAllPageSetting,
  useSavedViews,
} from '@affine/component/page-list';
import type { View } from '@affine/env/filter';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  DeleteIcon,
  EdgelessIcon,
  FilterIcon,
  MoreHorizontalIcon,
  PageIcon,
  PinIcon,
  ViewLayersIcon,
} from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import type { DragEndEvent } from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import * as Collapsible from '@radix-ui/react-collapsible';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useAtomValue } from 'jotai';
import { useRouter } from 'next/router';
import type { ReactElement } from 'react';
import React, { useCallback, useMemo, useState } from 'react';

import { pageSettingFamily } from '../../../../atoms';
import type { AllWorkspace } from '../../../../shared';
import { filterPage } from '../../../../utils/filter';
import type { SmartFolderListProps } from '../index';
import * as styles from './styles.css';

const Page = ({
  page,
  workspace,
}: {
  page: PageMeta;
  workspace: AllWorkspace;
}) => {
  const t = useAFFiNEI18N();
  const pageId = page.id;
  const setting = useAtomValue(pageSettingFamily(pageId));
  const icon = setting?.mode === 'edgeless' ? <EdgelessIcon /> : <PageIcon />;
  return (
    <MenuLinkItem
      icon={icon}
      href={`/workspace/${workspace.id}/${page.id}`}
      className={styles.title}
    >
      {page.title || t['Untitled']()}
    </MenuLinkItem>
  );
};
const SMART_FOLDER_DROP_AREA_PREFIX = 'smart-folder-';
const isSmartFolderDropArea = (id?: string | number) => {
  return typeof id === 'string' && id.startsWith(SMART_FOLDER_DROP_AREA_PREFIX);
};
export const processSmartFolderDrag = (e: DragEndEvent) => {
  if (
    isSmartFolderDropArea(e.over?.id) &&
    String(e.active.id).startsWith('page-list-item-')
  ) {
    e.over?.data.current?.addToView?.(e.active.data.current?.pageId);
  }
};
const FolderOperations = ({
  view,
  showUpdateView,
  setting,
}: {
  view: View;
  showUpdateView: () => void;
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
      | { render: ReactElement }
    >
  >(
    () => [
      {
        icon: <FilterIcon />,
        name: 'Edit Filter',
        click: showUpdateView,
      },
      {
        icon: <PinIcon />,
        name: 'Unpin',
        click: () => {
          return setting.updateView({
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
          return setting.deleteView(view.id);
        },
        className: styles.deleteFolder,
      },
    ],
    [setting, showUpdateView, view]
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
const Folder = ({
  view,
  pages,
  workspace,
}: {
  view: View;
  pages: PageMeta[];
  workspace: AllWorkspace;
}) => {
  const [collapsed, setCollapsed] = React.useState(true);
  const { selectView, addPage } = useAllPageSetting();
  const router = useRouter();
  const clickFolder = useCallback(() => {
    router
      .push(`/workspace/${workspace.id}/all`)
      .then(() => {
        selectView(view.id);
      })
      .catch(err => {
        console.error(err);
      });
  }, [router, selectView, view.id, workspace.id]);
  const { setNodeRef, isOver } = useDroppable({
    id: `${SMART_FOLDER_DROP_AREA_PREFIX}${view.id}`,
    data: {
      addToView: (id: string) => {
        addPage(view.id, id).catch(err => {
          console.error(err);
        });
      },
    },
  });
  const [show, showUpdateView] = useState(false);
  const setting = useAllPageSetting();
  return (
    <Collapsible.Root open={!collapsed}>
      <EditViewModel
        init={view}
        onConfirm={setting.saveView}
        open={show}
        onClose={() => showUpdateView(false)}
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
              <FolderOperations
                view={view}
                showUpdateView={() => showUpdateView(true)}
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
        onClick={clickFolder}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>{view.name}</div>
        </div>
      </MenuItem>
      <Collapsible.Content>
        <div style={{ marginLeft: 8 }}>
          {pages
            .filter(page => filterPage(view, page))
            .map(page => {
              return <Page page={page} key={page.id} workspace={workspace} />;
            })}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};
export const SmartFolderList = ({ currentWorkspace }: SmartFolderListProps) => {
  const metas = useBlockSuitePageMeta(currentWorkspace.blockSuiteWorkspace);
  const { savedViews } = useSavedViews();

  return (
    <div className={styles.wrapper}>
      {savedViews
        .filter(v => v.pinned)
        .map(view => {
          return (
            <Folder
              key={view.id}
              view={view}
              pages={metas}
              workspace={currentWorkspace}
            />
          );
        })}
    </div>
  );
};
