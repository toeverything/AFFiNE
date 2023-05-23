import { MenuLinkItem } from '@affine/component/app-sidebar';
import { EdgelessIcon, PageIcon } from '@blocksuite/icons';
import type { PageMeta, Workspace } from '@blocksuite/store';
import * as Collapsible from '@radix-ui/react-collapsible';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useBlockSuitePageReferences } from '@toeverything/hooks/use-block-suite-page-references';
import { useAtomValue } from 'jotai';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';

import { workspacePreferredModeAtom } from '../../../../atoms';
import type { FavoriteListProps } from '../index';
import EmptyItem from './empty-item';
import * as styles from './styles.css';

interface FavoriteMenuItemProps {
  workspace: Workspace;
  pageId: string;
  metaMapping: Record<string, PageMeta>;
  parentIds: Set<string>;
}

function FavoriteMenuItem({
  workspace,
  pageId,
  metaMapping,
  parentIds,
}: FavoriteMenuItemProps) {
  const router = useRouter();
  const record = useAtomValue(workspacePreferredModeAtom);
  const active = router.query.pageId === pageId;
  const icon = record[pageId] === 'edgeless' ? <EdgelessIcon /> : <PageIcon />;
  const references = useBlockSuitePageReferences(workspace, pageId);
  const referencesToShow = useMemo(() => {
    return [...new Set(references.filter(ref => !parentIds.has(ref)))];
  }, [references, parentIds]);
  const [collapsed, setCollapsed] = useState(true);
  const collapsible = referencesToShow.length > 0;
  const nestedItem = parentIds.size > 0;
  const untitled = !metaMapping[pageId]?.title;
  return (
    <Collapsible.Root
      className={styles.favItemWrapper}
      data-nested={nestedItem}
      open={!collapsed}
    >
      <MenuLinkItem
        data-type="favorite-list-item"
        data-testid={`favorite-list-item-${pageId}`}
        active={active}
        href={`/workspace/${workspace.id}/${pageId}`}
        icon={icon}
        collapsed={collapsible ? collapsed : undefined}
        onCollapsedChange={setCollapsed}
      >
        <span className={styles.label} data-untitled={untitled}>
          {metaMapping[pageId]?.title || 'Untitled'}
        </span>
      </MenuLinkItem>
      {collapsible && (
        <Collapsible.Content className={styles.collapsibleContent}>
          <div className={styles.collapsibleContentInner}>
            {referencesToShow.map(ref => {
              return (
                <FavoriteMenuItem
                  key={ref}
                  workspace={workspace}
                  pageId={ref}
                  metaMapping={metaMapping}
                  parentIds={new Set([...parentIds, pageId])}
                />
              );
            })}
          </div>
        </Collapsible.Content>
      )}
    </Collapsible.Root>
  );
}

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
          <FavoriteMenuItem
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
