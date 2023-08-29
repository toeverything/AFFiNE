import { MenuLinkItem } from '@affine/component/app-sidebar';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { EdgelessIcon, PageIcon } from '@blocksuite/icons';
import type { PageMeta, Workspace } from '@blocksuite/store';
import * as Collapsible from '@radix-ui/react-collapsible';
import { useBlockSuitePageReferences } from '@toeverything/hooks/use-block-suite-page-references';
import { useAtomValue } from 'jotai/react';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

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
  const params = useParams();
  const setting = useAtomValue(pageSettingFamily(pageId));
  const active = params.pageId === pageId;
  const icon = setting?.mode === 'edgeless' ? <EdgelessIcon /> : <PageIcon />;
  const references = useBlockSuitePageReferences(workspace, pageId);
  const referencesToShow = useMemo(() => {
    return [
      ...new Set(
        references.filter(ref => metaMapping[ref] && !metaMapping[ref]?.trash)
      ),
    ];
  }, [references, metaMapping]);
  const [collapsed, setCollapsed] = useState(true);
  const collapsible = referencesToShow.length > 0;
  const nestedItem = parentIds.size > 0;
  const untitled = !metaMapping[pageId]?.title;
  const t = useAFFiNEI18N();
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
        to={`/workspace/${workspace.id}/${pageId}`}
        icon={icon}
        collapsed={collapsible ? collapsed : undefined}
        onCollapsedChange={setCollapsed}
      >
        <span className={styles.label} data-untitled={untitled}>
          {metaMapping[pageId]?.title || t['Untitled']()}
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
