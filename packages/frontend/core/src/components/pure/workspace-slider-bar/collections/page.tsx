import { MenuItem as CollectionItem } from '@affine/component/app-sidebar';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  DeleteIcon,
  EdgelessIcon,
  FilterMinusIcon,
  MoreHorizontalIcon,
  PageIcon,
} from '@blocksuite/icons';
import type { PageMeta, Workspace } from '@blocksuite/store';
import * as Collapsible from '@radix-ui/react-collapsible';
import { IconButton } from '@toeverything/components/button';
import {
  Menu,
  MenuIcon,
  MenuItem,
  type MenuItemProps,
} from '@toeverything/components/menu';
import { useBlockSuitePageReferences } from '@toeverything/hooks/use-block-suite-page-references';
import { useAtomValue } from 'jotai/index';
import type { ReactElement } from 'react';
import React, { useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';

import { pageSettingFamily } from '../../../../atoms';
import { useTrashModalHelper } from '../../../../hooks/affine/use-trash-modal-helper';
import { useNavigateHelper } from '../../../../hooks/use-navigate-helper';
import { ReferencePage } from '../components/reference-page';
import * as styles from './styles.css';

export const PageOperations = ({
  page,
  inAllowList,
  removeFromAllowList,
  workspace,
}: {
  workspace: Workspace;
  page: PageMeta;
  inAllowList: boolean;
  removeFromAllowList: (id: string) => void;
}) => {
  const t = useAFFiNEI18N();
  const { setTrashModal } = useTrashModalHelper(workspace);
  const onClickDelete = useCallback(() => {
    setTrashModal({
      open: true,
      pageIds: [page.id],
      pageTitles: [page.title],
    });
  }, [page.id, page.title, setTrashModal]);
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
      ...(inAllowList
        ? [
            {
              icon: (
                <MenuIcon>
                  <FilterMinusIcon />
                </MenuIcon>
              ),
              name: t['Remove special filter'](),
              click: () => removeFromAllowList(page.id),
            },
            {
              element: (
                <div key="divider" className={styles.menuDividerStyle}></div>
              ),
            },
          ]
        : []),
      {
        icon: (
          <MenuIcon>
            <DeleteIcon />
          </MenuIcon>
        ),
        name: t['com.affine.trashOperation.delete'](),
        click: onClickDelete,
        type: 'danger',
      },
    ],
    [inAllowList, t, onClickDelete, removeFromAllowList, page.id]
  );
  return (
    <>
      {actions.map(action => {
        if (action.element) {
          return action.element;
        }
        return (
          <MenuItem
            data-testid="collection-page-option"
            key={action.name}
            type={action.type}
            preFix={action.icon}
            onClick={action.click}
          >
            {action.name}
          </MenuItem>
        );
      })}
    </>
  );
};
export const Page = ({
  page,
  workspace,
  allPageMeta,
  inAllowList,
  removeFromAllowList,
}: {
  page: PageMeta;
  inAllowList: boolean;
  removeFromAllowList: (id: string) => void;
  workspace: Workspace;
  allPageMeta: Record<string, PageMeta>;
}) => {
  const [collapsed, setCollapsed] = React.useState(true);
  const params = useParams();
  const { jumpToPage } = useNavigateHelper();
  const t = useAFFiNEI18N();
  const pageId = page.id;
  const active = params.pageId === pageId;
  const setting = useAtomValue(pageSettingFamily(pageId));
  const icon = setting?.mode === 'edgeless' ? <EdgelessIcon /> : <PageIcon />;
  const references = useBlockSuitePageReferences(workspace, pageId);
  const clickPage = useCallback(() => {
    jumpToPage(workspace.id, page.id);
  }, [jumpToPage, page.id, workspace.id]);
  const referencesToRender = references.filter(id => !allPageMeta[id]?.trash);
  return (
    <Collapsible.Root open={!collapsed}>
      <CollectionItem
        data-testid="collection-page"
        data-type="collection-list-item"
        icon={icon}
        onClick={clickPage}
        className={styles.title}
        active={active}
        collapsed={referencesToRender.length > 0 ? collapsed : undefined}
        onCollapsedChange={setCollapsed}
        postfix={
          <Menu
            items={
              <PageOperations
                inAllowList={inAllowList}
                removeFromAllowList={removeFromAllowList}
                page={page}
                workspace={workspace}
              />
            }
          >
            <IconButton
              data-testid="collection-page-options"
              type="plain"
              withoutHoverStyle
            >
              <MoreHorizontalIcon />
            </IconButton>
          </Menu>
        }
      >
        {page.title || t['Untitled']()}
      </CollectionItem>
      <Collapsible.Content className={styles.collapsibleContent}>
        {referencesToRender.map(id => {
          return (
            <ReferencePage
              key={id}
              workspace={workspace}
              pageId={id}
              metaMapping={allPageMeta}
              parentIds={new Set([pageId])}
            />
          );
        })}
      </Collapsible.Content>
    </Collapsible.Root>
  );
};
