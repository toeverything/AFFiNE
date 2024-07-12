import {
  getDNDId,
  parseDNDId,
} from '@affine/core/hooks/affine/use-global-dnd-helper';
import { useI18n } from '@affine/i18n';
import { EdgelessIcon, PageIcon } from '@blocksuite/icons/rc';
import { type AnimateLayoutChanges, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DocsService, useLiveData, useService } from '@toeverything/infra';
import { useMemo } from 'react';

import { DragMenuItemOverlay } from '../components/drag-menu-item-overlay';
import { SidebarDocItem } from '../doc-tree/doc';
import * as styles from './styles.css';

const animateLayoutChanges: AnimateLayoutChanges = ({
  isSorting,
  wasDragging,
}) => (isSorting || wasDragging ? false : true);

export const FavouriteDocSidebarNavItem = ({ docId }: { docId: string }) => {
  const t = useI18n();
  const docsService = useService(DocsService);
  const docRecord = useLiveData(docsService.list.doc$(docId));
  const docMode = useLiveData(docRecord?.mode$);
  const docTitle = useLiveData(docRecord?.title$);
  const pageTitle = docTitle || t['Untitled']();

  const icon = useMemo(() => {
    return docMode === 'edgeless' ? <EdgelessIcon /> : <PageIcon />;
  }, [docMode]);

  const overlayPreview = useMemo(() => {
    return <DragMenuItemOverlay icon={icon} title={pageTitle} />;
  }, [icon, pageTitle]);

  const dragItemId = getDNDId('sidebar-pin', 'doc', docId);

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
    <div
      className={styles.favItemWrapper}
      style={style}
      ref={setNodeRef}
      data-draggable={true}
      data-dragging={isDragging}
      data-testid={`favourite-page-${docId}`}
      data-favourite-page-item
      {...attributes}
      {...listeners}
    >
      <SidebarDocItem
        docId={docId}
        postfixConfig={{
          inFavorites: true,
        }}
      />
    </div>
  );
};
