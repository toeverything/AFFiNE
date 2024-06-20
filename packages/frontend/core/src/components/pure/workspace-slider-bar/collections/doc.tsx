import { DocsSearchService } from '@affine/core/modules/docs-search';
import {
  WorkbenchLink,
  WorkbenchService,
} from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import { EdgelessIcon, PageIcon } from '@blocksuite/icons/rc';
import type { DocMeta } from '@blocksuite/store';
import { useDraggable } from '@dnd-kit/core';
import * as Collapsible from '@radix-ui/react-collapsible';
import {
  DocsService,
  effect,
  fromPromise,
  onStart,
  useLiveData,
  useService,
  useServices,
} from '@toeverything/infra';
import React, { useEffect, useMemo, useState } from 'react';
import { EMPTY, mergeMap } from 'rxjs';

import {
  type DNDIdentifier,
  getDNDId,
} from '../../../../hooks/affine/use-global-dnd-helper';
import { MenuLinkItem } from '../../../app-sidebar';
import { DragMenuItemOverlay } from '../components/drag-menu-item-overlay';
import { PostfixItem } from '../components/postfix-item';
import { ReferencePage } from '../components/reference-page';
import * as styles from './styles.css';

export const Doc = ({
  docId,
  parentId,
  inAllowList,
  removeFromAllowList,
}: {
  parentId: DNDIdentifier;
  docId: string;
  inAllowList: boolean;
  removeFromAllowList: (id: string) => void;
  allPageMeta: Record<string, DocMeta>;
}) => {
  const { docsSearchService, workbenchService, docsService } = useServices({
    DocsSearchService,
    WorkbenchService,
    DocsService,
  });
  const t = useI18n();
  const location = useLiveData(workbenchService.workbench.location$);
  const active = location.pathname === '/' + docId;

  const [collapsed, setCollapsed] = React.useState(true);
  const docRecord = useLiveData(useService(DocsService).list.doc$(docId));
  const docMode = useLiveData(docRecord?.mode$);
  const docTitle = useLiveData(docRecord?.title$);
  const icon = useMemo(() => {
    return docMode === 'edgeless' ? <EdgelessIcon /> : <PageIcon />;
  }, [docMode]);
  const [references, setReferences] = useState<{
    refs: string[];
    loading: boolean;
  }>({ loading: true, refs: [] });
  const trashDocs = useLiveData(docsService.list.trashDocs$);
  const filteredReferences = useMemo(
    () => references.refs.filter(ref => !trashDocs.some(doc => doc.id === ref)),
    [references.refs, trashDocs]
  );

  const dragItemId = getDNDId('collection-list', 'doc', docId, parentId);

  useEffect(() => {
    if (collapsed) {
      return;
    }
    const loadReferences = effect(
      mergeMap(() => {
        return fromPromise(async () => {
          const refs = await docsSearchService.searchRefsFrom(docId);
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
  }, [collapsed, docsSearchService, docId]);

  const title = docTitle || t['Untitled']();
  const docTitleElement = useMemo(() => {
    return <DragMenuItemOverlay icon={icon} title={docTitle} />;
  }, [icon, docTitle]);

  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: dragItemId,
    data: {
      preview: docTitleElement,
    },
  });

  return (
    <Collapsible.Root
      open={!collapsed}
      data-draggable={true}
      data-dragging={isDragging}
    >
      <MenuLinkItem
        data-testid="collection-page"
        data-type="collection-list-item"
        icon={icon}
        to={`/${docId}`}
        linkComponent={WorkbenchLink}
        className={styles.title}
        active={active}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        postfix={
          <PostfixItem
            pageId={docId}
            pageTitle={title}
            removeFromAllowList={removeFromAllowList}
            inAllowList={inAllowList}
          />
        }
        ref={setNodeRef}
        {...attributes}
        {...listeners}
      >
        {title || t['Untitled']()}
      </MenuLinkItem>
      <Collapsible.Content className={styles.collapsibleContent}>
        {filteredReferences.length > 0 ? (
          filteredReferences.map(id => {
            return (
              <ReferencePage
                key={id}
                pageId={id}
                parentIds={new Set([docId])}
              />
            );
          })
        ) : references.loading ? null : (
          <div className={styles.noReferences}>
            {t['com.affine.rootAppSidebar.docs.no-subdoc']()}
          </div>
        )}
      </Collapsible.Content>
    </Collapsible.Root>
  );
};
