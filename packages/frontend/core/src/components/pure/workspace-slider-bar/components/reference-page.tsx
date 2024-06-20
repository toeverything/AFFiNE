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
  effect,
  fromPromise,
  onStart,
  useLiveData,
  useServices,
} from '@toeverything/infra';
import { useEffect, useMemo, useState } from 'react';
import { EMPTY, mergeMap } from 'rxjs';

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
  const [references, setReferences] = useState<{
    refs: string[];
    loading: boolean;
  }>({ loading: true, refs: [] });
  const trashDocs = useLiveData(docsService.list.trashDocs$);
  const filteredReferences = useMemo(
    () => references.refs.filter(ref => !trashDocs.some(doc => doc.id === ref)),
    [references.refs, trashDocs]
  );
  const nestedItem = parentIds && parentIds.size > 0;
  const untitled = !docTitle;
  const pageTitle = docTitle || t['Untitled']();

  useEffect(() => {
    if (collapsed) {
      return;
    }
    const loadReferences = effect(
      mergeMap(() => {
        return fromPromise(async () => {
          const refs = await docsSearchService.searchRefsFrom(pageId);
          console.log(refs);
          return refs;
        }).pipe(
          mergeMap(refs => {
            setReferences({ refs: refs.map(r => r.docId), loading: false });
            return EMPTY;
          }),
          onStart(() => {
            setReferences(prev => ({ ...prev, loading: true }));
          })
        );
      })
    );

    loadReferences();

    return () => {
      loadReferences.unsubscribe();
    };
  }, [collapsed, docsSearchService, pageId]);

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
        <span className={styles.label} data-untitled={untitled}>
          {pageTitle}
        </span>
      </MenuLinkItem>
      <Collapsible.Content className={styles.collapsibleContent}>
        <div className={styles.collapsibleContentInner}>
          {filteredReferences.length > 0 ? (
            filteredReferences.map(id => {
              return (
                <ReferencePage
                  key={id}
                  pageId={id}
                  parentIds={new Set([...(parentIds ?? []), pageId])}
                />
              );
            })
          ) : references.loading ? null : (
            <div className={styles.noReferences}>
              {t['com.affine.rootAppSidebar.docs.no-subdoc']()}
            </div>
          )}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};
