import { Loading, Tooltip } from '@affine/component';
import {
  getDNDId,
  parseDNDId,
} from '@affine/core/hooks/affine/use-global-dnd-helper';
import { DocsSearchService } from '@affine/core/modules/docs-search';
import {
  WorkbenchLink,
  WorkbenchService,
} from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import { EdgelessIcon, PageIcon } from '@blocksuite/icons/rc';
import { type AnimateLayoutChanges, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import * as Collapsible from '@radix-ui/react-collapsible';
import {
  DocsService,
  LiveData,
  useLiveData,
  useServices,
} from '@toeverything/infra';
import { useEffect, useMemo, useState } from 'react';

import { MenuLinkItem } from '../../../app-sidebar';
import { DragMenuItemOverlay } from '../components/drag-menu-item-overlay';
import * as draggableMenuItemStyles from '../components/draggable-menu-item.css';
import { PostfixItem } from '../components/postfix-item';
import type { ReferencePageProps } from '../components/reference-page';
import { ReferencePage } from '../components/reference-page';
import * as styles from './styles.css';

const animateLayoutChanges: AnimateLayoutChanges = ({
  isSorting,
  wasDragging,
}) => (isSorting || wasDragging ? false : true);

export const FavouriteDocSidebarNavItem = ({
  pageId,
}: ReferencePageProps & {
  sortable?: boolean;
}) => {
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
  const [collapsed, setCollapsed] = useState(true);
  const untitled = !docTitle;
  const pageTitle = docTitle || t['Untitled']();

  const icon = useMemo(() => {
    return docMode === 'edgeless' ? <EdgelessIcon /> : <PageIcon />;
  }, [docMode]);

  const overlayPreview = useMemo(() => {
    return <DragMenuItemOverlay icon={icon} title={pageTitle} />;
  }, [icon, pageTitle]);

  const dragItemId = getDNDId('sidebar-pin', 'doc', pageId);

  const {
    setNodeRef,
    isDragging,
    attributes,
    listeners,
    transform,
    transition,
    active,
  } = useSortable({
    id: dragItemId,
    data: {
      preview: overlayPreview,
    },
    animateLayoutChanges,
  });

  const isSorting = parseDNDId(active?.id)?.where === 'sidebar-pin';
  const style = {
    transform: CSS.Translate.toString(transform),
    transition: isSorting ? transition : undefined,
  };

  return (
    <Collapsible.Root
      className={styles.favItemWrapper}
      open={!collapsed}
      style={style}
      ref={setNodeRef}
      {...attributes}
    >
      <MenuLinkItem
        {...listeners}
        data-testid={`favourite-page-${pageId}`}
        data-favourite-page-item
        icon={icon}
        data-draggable={true}
        data-dragging={isDragging}
        className={draggableMenuItemStyles.draggableMenuItem}
        active={linkActive}
        to={`/${pageId}`}
        linkComponent={WorkbenchLink}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        postfix={
          <PostfixItem
            pageId={pageId}
            pageTitle={pageTitle}
            inFavorites={true}
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
      </Collapsible.Content>
    </Collapsible.Root>
  );
};
