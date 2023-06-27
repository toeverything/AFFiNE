import { MenuItem, MenuLinkItem } from '@affine/component/app-sidebar';
import { useSavedViews } from '@affine/component/page-list';
import type { View } from '@affine/env/filter';
import { EdgelessIcon, PageIcon, ViewLayersIcon } from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import * as Collapsible from '@radix-ui/react-collapsible';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useAtomValue } from 'jotai';
import React from 'react';

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
  const pageId = page.id;
  const setting = useAtomValue(pageSettingFamily(pageId));
  const icon = setting?.mode === 'edgeless' ? <EdgelessIcon /> : <PageIcon />;
  return (
    <MenuLinkItem
      icon={icon}
      href={`/workspace/${workspace.id}/${page.id}`}
      className={styles.title}
    >
      {page.title}
    </MenuLinkItem>
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
  return (
    <Collapsible.Root open={!collapsed}>
      <MenuItem
        onCollapsedChange={setCollapsed}
        icon={<ViewLayersIcon />}
        collapsed={collapsed}
      >
        {view.name}
      </MenuItem>
      <Collapsible.Content>
        <div style={{ marginLeft: 8 }}>
          {pages
            .filter(page => filterPage(view.filterList, page))
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
