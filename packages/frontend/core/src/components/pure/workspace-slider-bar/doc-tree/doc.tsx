import { Loading, Tooltip } from '@affine/component';
import type { MenuItemProps } from '@affine/core/components/app-sidebar';
import {
  type DNDIdentifier,
  type DndWhere,
  getDNDId,
} from '@affine/core/hooks/affine/use-global-dnd-helper';
import { DocsSearchService } from '@affine/core/modules/docs-search';
import {
  WorkbenchLink,
  WorkbenchService,
} from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import { EdgelessIcon, PageIcon } from '@blocksuite/icons/rc';
import { useDraggable } from '@dnd-kit/core';
import {
  DocsService,
  LiveData,
  useLiveData,
  useServices,
} from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { useEffect, useMemo, useState } from 'react';

import { DragMenuItemOverlay } from '../components/drag-menu-item-overlay';
import { PostfixItem, type PostfixItemProps } from '../components/postfix-item';
import * as styles from './doc.css';
import { SidebarDocTreeNode } from './node';

export type SidebarDocItemProps = {
  docId: string;
  postfixConfig?: Omit<
    PostfixItemProps,
    'pageId' | 'pageTitle' | 'isReferencePage'
  >;
  isReference?: boolean;
  dragConfig?: {
    parentId?: DNDIdentifier;
    where: DndWhere;
  };
  menuItemProps?: Partial<MenuItemProps> & Record<`data-${string}`, string>;
};

export const SidebarDocItem = function SidebarDocItem({
  docId,
  postfixConfig,
  isReference,
  dragConfig,
  menuItemProps,
}: SidebarDocItemProps) {
  const { docsSearchService, workbenchService, docsService } = useServices({
    DocsSearchService,
    WorkbenchService,
    DocsService,
  });
  const t = useI18n();
  const location = useLiveData(workbenchService.workbench.location$);
  const active = location.pathname === '/' + docId;

  const docRecord = useLiveData(docsService.list.doc$(docId));
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
  const title = docTitle || t['Untitled']();

  // drag (not available for sub-docs)
  const dragItemId = dragConfig
    ? getDNDId(dragConfig.where, 'doc', docId, dragConfig.parentId)
    : nanoid();
  const docTitleElement = useMemo(() => {
    return <DragMenuItemOverlay icon={icon} title={docTitle} />;
  }, [icon, docTitle]);
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: dragItemId,
    data: { preview: docTitleElement },
    disabled: !dragConfig || isReference,
  });

  const dragAttrs: Partial<MenuItemProps> = isReference
    ? {
        // prevent dragging parent node
        onMouseDown: e => e.stopPropagation(),
      }
    : { ...attributes, ...listeners };

  // workaround to avoid invisible in playwright caused by nested drag
  delete dragAttrs['aria-disabled'];

  return (
    <SidebarDocTreeNode
      ref={setNodeRef}
      rootProps={{ 'data-dragging': isDragging }}
      node={{ type: 'doc', data: docId }}
      to={`/${docId}`}
      linkComponent={WorkbenchLink}
      menuItemProps={{
        'data-type': isReference ? 'reference-page' : undefined,
        icon,
        active,
        className: styles.title,
        postfix: (
          <PostfixItem
            pageId={docId}
            pageTitle={title}
            isReferencePage={isReference}
            {...postfixConfig}
          />
        ),
        ...dragAttrs,
        ...menuItemProps,
      }}
      subTree={
        references ? (
          references.length > 0 ? (
            references.map(({ docId: childDocId }) => {
              return (
                <SidebarDocItem
                  key={childDocId}
                  docId={childDocId}
                  isReference={true}
                  menuItemProps={{
                    'data-testid': `reference-page-${childDocId}`,
                  }}
                />
              );
            })
          ) : (
            <div className={styles.noReferences}>
              {t['com.affine.rootAppSidebar.docs.no-subdoc']()}
            </div>
          )
        ) : null
      }
    >
      <div className={styles.labelContainer}>
        <span className={styles.label} data-untitled={untitled}>
          {title || t['Untitled']()}
        </span>
        {referencesLoading && (
          <Tooltip
            content={t['com.affine.rootAppSidebar.docs.references-loading']()}
          >
            <div className={styles.labelTooltipContainer}>
              <Loading />
            </div>
          </Tooltip>
        )}
      </div>
    </SidebarDocTreeNode>
  );
};
