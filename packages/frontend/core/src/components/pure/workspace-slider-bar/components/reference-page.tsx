import { useBlockSuitePageReferences } from '@affine/core/hooks/use-block-suite-page-references';
import {
  WorkbenchLink,
  WorkbenchService,
} from '@affine/core/modules/workbench';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { EdgelessIcon, PageIcon } from '@blocksuite/icons/rc';
import type { DocCollection, DocMeta } from '@blocksuite/store';
import * as Collapsible from '@radix-ui/react-collapsible';
import { DocsService, useLiveData, useService } from '@toeverything/infra';
import { useMemo, useState } from 'react';

import { MenuLinkItem } from '../../../app-sidebar';
import * as styles from '../favorite/styles.css';
import { PostfixItem } from './postfix-item';
export interface ReferencePageProps {
  docCollection: DocCollection;
  pageId: string;
  metaMapping: Record<string, DocMeta>;
  parentIds?: Set<string>;
}

export const ReferencePage = ({
  docCollection,
  pageId,
  metaMapping,
  parentIds,
}: ReferencePageProps) => {
  const t = useAFFiNEI18N();
  const workbench = useService(WorkbenchService).workbench;
  const location = useLiveData(workbench.location$);
  const active = location.pathname === '/' + pageId;

  const pageRecord = useLiveData(useService(DocsService).list.doc$(pageId));
  const pageMode = useLiveData(pageRecord?.mode$);
  const icon = useMemo(() => {
    return pageMode === 'edgeless' ? <EdgelessIcon /> : <PageIcon />;
  }, [pageMode]);

  const references = useBlockSuitePageReferences(docCollection, pageId);
  const referencesToShow = useMemo(() => {
    return [
      ...new Set(
        references.filter(ref => metaMapping[ref] && !metaMapping[ref]?.trash)
      ),
    ];
  }, [references, metaMapping]);

  const [collapsed, setCollapsed] = useState(true);
  const collapsible = referencesToShow.length > 0;
  const nestedItem = parentIds && parentIds.size > 0;

  const untitled = !metaMapping[pageId]?.title;
  const pageTitle = metaMapping[pageId]?.title || t['Untitled']();

  return (
    <Collapsible.Root
      className={styles.favItemWrapper}
      data-nested={nestedItem}
      open={!collapsed}
    >
      <MenuLinkItem
        data-type="reference-page"
        data-testid={`reference-page-${pageId}`}
        active={active}
        to={`/${pageId}`}
        icon={icon}
        collapsed={collapsible ? collapsed : undefined}
        onCollapsedChange={setCollapsed}
        linkComponent={WorkbenchLink}
        postfix={
          <PostfixItem
            docCollection={docCollection}
            pageId={pageId}
            pageTitle={pageTitle}
            isReferencePage={true}
          />
        }
      >
        <span className={styles.label} data-untitled={untitled}>
          {pageTitle}
        </span>
      </MenuLinkItem>
      {collapsible && (
        <Collapsible.Content className={styles.collapsibleContent}>
          <div className={styles.collapsibleContentInner}>
            {referencesToShow.map(ref => {
              return (
                <ReferencePage
                  key={ref}
                  docCollection={docCollection}
                  pageId={ref}
                  metaMapping={metaMapping}
                  parentIds={new Set([...(parentIds ?? []), pageId])}
                />
              );
            })}
          </div>
        </Collapsible.Content>
      )}
    </Collapsible.Root>
  );
};
