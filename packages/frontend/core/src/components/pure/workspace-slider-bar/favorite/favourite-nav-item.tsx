import {
  getDNDId,
  parseDNDId,
} from '@affine/core/hooks/affine/use-global-dnd-helper';
import { useBlockSuitePageReferences } from '@affine/core/hooks/use-block-suite-page-references';
import {
  WorkbenchLink,
  WorkbenchService,
} from '@affine/core/modules/workbench';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { EdgelessIcon, PageIcon } from '@blocksuite/icons/rc';
import { type AnimateLayoutChanges, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import * as Collapsible from '@radix-ui/react-collapsible';
import { DocsService, useLiveData, useService } from '@toeverything/infra';
import { useMemo, useState } from 'react';

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
  docCollection: workspace,
  pageId,
  metaMapping,
}: ReferencePageProps & {
  sortable?: boolean;
}) => {
  const t = useAFFiNEI18N();
  const workbench = useService(WorkbenchService).workbench;
  const location = useLiveData(workbench.location$);
  const linkActive = location.pathname === '/' + pageId;
  const docRecord = useLiveData(useService(DocsService).list.doc$(pageId));
  const docMode = useLiveData(docRecord?.mode$);

  const icon = useMemo(() => {
    return docMode === 'edgeless' ? <EdgelessIcon /> : <PageIcon />;
  }, [docMode]);

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

  const untitled = !metaMapping[pageId]?.title;
  const pageTitle = metaMapping[pageId]?.title || t['Untitled']();

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
        collapsed={collapsible ? collapsed : undefined}
        onCollapsedChange={setCollapsed}
        postfix={
          <PostfixItem
            docCollection={workspace}
            pageId={pageId}
            pageTitle={pageTitle}
            inFavorites={true}
          />
        }
      >
        <span className={styles.label} data-untitled={untitled}>
          {pageTitle}
        </span>
      </MenuLinkItem>
      <Collapsible.Content className={styles.collapsibleContent}>
        {referencesToShow.map(id => {
          return (
            <ReferencePage
              key={id}
              docCollection={workspace}
              pageId={id}
              metaMapping={metaMapping}
              parentIds={new Set([pageId])}
            />
          );
        })}
      </Collapsible.Content>
    </Collapsible.Root>
  );
};
