import { Loading, Tooltip } from '@affine/component';
import { DocsSearchService } from '@affine/core/modules/docs-search';
import {
  WorkbenchLink,
  WorkbenchService,
} from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import { EdgelessIcon, PageIcon } from '@blocksuite/icons/rc';
import * as Collapsible from '@radix-ui/react-collapsible';
import {
  DocsService,
  LiveData,
  useLiveData,
  useServices,
} from '@toeverything/infra';
import { useEffect, useMemo, useState } from 'react';

import { MenuLinkItem } from '../../../app-sidebar';
import * as styles from '../favorite/styles.css';
import { PostfixItem } from './postfix-item';
export interface ReferencePageProps {
  pageId: string;
  parentIds?: Set<string>;
}

export const ReferencePage = ({ pageId, parentIds }: ReferencePageProps) => {
  const t = useI18n();
  const { docsSearchService, workbenchService, docsService } = useServices({
    DocsSearchService,
    WorkbenchService,
    DocsService,
  });
  const workbench = workbenchService.workbench;
  const location = useLiveData(workbench.location$);
  const linkActive = location.pathname === '/' + pageId;
  const docRecord = useLiveData(docsService.list.doc$(pageId));
  const docMode = useLiveData(docRecord?.mode$);
  const docTitle = useLiveData(docRecord?.title$);
  const icon = useMemo(() => {
    return docMode === 'edgeless' ? <EdgelessIcon /> : <PageIcon />;
  }, [docMode]);
  const [collapsed, setCollapsed] = useState(true);
  const references = useLiveData(
    useMemo(
      () => LiveData.from(docsSearchService.watchRefsFrom(pageId), null),
      [docsSearchService, pageId]
    )
  );
  const indexerLoading = useLiveData(
    docsSearchService.indexer.status$.map(
      v => v.remaining === undefined || v.remaining > 0
    )
  );
  const [referencesLoading, setReferencesLoading] = useState(true);
  useEffect(() => {
    setReferencesLoading(
      prev =>
        prev &&
        indexerLoading /* after loading becomes false, it never becomes true */
    );
  }, [indexerLoading]);
  const nestedItem = parentIds && parentIds.size > 0;
  const untitled = !docTitle;
  const pageTitle = docTitle || t['Untitled']();

  return (
    <Collapsible.Root
      className={styles.favItemWrapper}
      data-nested={nestedItem}
      open={!collapsed}
    >
      <MenuLinkItem
        data-type="reference-page"
        data-testid={`reference-page-${pageId}`}
        active={linkActive}
        to={`/${pageId}`}
        icon={icon}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        linkComponent={WorkbenchLink}
        postfix={
          <PostfixItem
            pageId={pageId}
            pageTitle={pageTitle}
            isReferencePage={true}
          />
        }
      >
        <div className={styles.labelContainer}>
          <span className={styles.label} data-untitled={untitled}>
            {pageTitle}
          </span>
          {!collapsed && referencesLoading && (
            <Tooltip
              content={t['com.affine.rootAppSidebar.docs.references-loading']()}
            >
              <div className={styles.labelTooltipContainer}>
                <Loading />
              </div>
            </Tooltip>
          )}
        </div>
      </MenuLinkItem>
      <Collapsible.Content className={styles.collapsibleContent}>
        <div className={styles.collapsibleContentInner}>
          {references ? (
            references.length > 0 ? (
              references.map(({ docId }) => {
                return (
                  <ReferencePage
                    key={docId}
                    pageId={docId}
                    parentIds={new Set([pageId])}
                  />
                );
              })
            ) : (
              <div className={styles.noReferences}>
                {t['com.affine.rootAppSidebar.docs.no-subdoc']()}
              </div>
            )
          ) : null}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};
