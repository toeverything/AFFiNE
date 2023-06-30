import { MenuLinkItem } from '@affine/component/app-sidebar';
import { EdgelessIcon, PageIcon } from '@blocksuite/icons';
import type { PageMeta, Workspace } from '@blocksuite/store';
import * as Collapsible from '@radix-ui/react-collapsible';
import { useBlockSuitePageReferences } from '@toeverything/hooks/use-block-suite-page-references';
import { useAtomValue } from 'jotai/index';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';

import { pageSettingFamily } from '../../../../atoms';
import * as styles from '../favorite/styles.css';
interface ReferencePageProps {
  workspace: Workspace;
  pageId: string;
  metaMapping: Record<string, PageMeta>;
  parentIds: Set<string>;
}

export const ReferencePage = ({
  workspace,
  pageId,
  metaMapping,
  parentIds,
}: ReferencePageProps) => {
  const router = useRouter();
  const setting = useAtomValue(pageSettingFamily(pageId));
  const active = router.query.pageId === pageId;
  const icon = setting?.mode === 'edgeless' ? <EdgelessIcon /> : <PageIcon />;
  const references = useBlockSuitePageReferences(workspace, pageId);
  const referencesToShow = useMemo(() => {
    return [
      ...new Set(
        references.filter(
          ref => !parentIds.has(ref) && !metaMapping[ref]?.trash
        )
      ),
    ];
  }, [references, parentIds, metaMapping]);
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
                <ReferencePage
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
};
