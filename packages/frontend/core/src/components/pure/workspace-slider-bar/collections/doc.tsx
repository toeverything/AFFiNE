import { Loading, Tooltip } from '@affine/component';
import { DocsSearchService } from '@affine/core/modules/docs-search';
import {
  WorkbenchLink,
  WorkbenchService,
} from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import { EdgelessIcon, PageIcon } from '@blocksuite/icons/rc';
import { useDraggable } from '@dnd-kit/core';
import * as Collapsible from '@radix-ui/react-collapsible';
import {
  DocsService,
  LiveData,
  useLiveData,
  useService,
  useServices,
} from '@toeverything/infra';
import React, { useEffect, useMemo, useState } from 'react';

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
}) => {
  const { docsSearchService, workbenchService } = useServices({
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
  const references = useLiveData(
    useMemo(
      () => LiveData.from(docsSearchService.watchRefsFrom(docId), null),
      [docsSearchService, docId]
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
  const untitled = !docTitle;

  const dragItemId = getDNDId('collection-list', 'doc', docId, parentId);

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
        <div className={styles.labelContainer}>
          <span className={styles.label} data-untitled={untitled}>
            {title || t['Untitled']()}
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
        {references ? (
          references.length > 0 ? (
            references.map(({ docId: childDocId }) => {
              return (
                <ReferencePage
                  key={childDocId}
                  pageId={childDocId}
                  parentIds={new Set([docId])}
                />
              );
            })
          ) : (
            <div className={styles.noReferences}>
              {t['com.affine.rootAppSidebar.docs.no-subdoc']()}
            </div>
          )
        ) : null}
      </Collapsible.Content>
    </Collapsible.Root>
  );
};
