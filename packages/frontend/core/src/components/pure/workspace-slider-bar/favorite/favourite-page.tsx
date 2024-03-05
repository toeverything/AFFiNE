import { useBlockSuitePageReferences } from '@affine/core/hooks/use-block-suite-page-references';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { EdgelessIcon, PageIcon } from '@blocksuite/icons';
import { useDraggable } from '@dnd-kit/core';
import * as Collapsible from '@radix-ui/react-collapsible';
import { useService } from '@toeverything/infra';
import { useLiveData } from '@toeverything/infra';
import { PageRecordList } from '@toeverything/infra';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { getDragItemId } from '../../../../hooks/affine/use-sidebar-drag';
import { MenuLinkItem } from '../../../app-sidebar';
import { DragMenuItemOverlay } from '../components/drag-menu-item-overlay';
import { PostfixItem } from '../components/postfix-item';
import {
  ReferencePage,
  type ReferencePageProps,
} from '../components/reference-page';
import * as styles from './styles.css';

export const FavouritePage = ({
  workspace,
  pageId,
  metaMapping,
  parentIds,
}: ReferencePageProps) => {
  const t = useAFFiNEI18N();
  const params = useParams();
  const active = params.pageId === pageId;
  const dragItemId = getDragItemId('favouritePage', pageId);
  const pageRecord = useLiveData(useService(PageRecordList).record(pageId));
  const pageMode = useLiveData(pageRecord?.mode);

  const icon = useMemo(() => {
    return pageMode === 'edgeless' ? <EdgelessIcon /> : <PageIcon />;
  }, [pageMode]);

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
  const pageTitle = metaMapping[pageId]?.title || t['Untitled']();

  const pageTitleElement = useMemo(() => {
    return <DragMenuItemOverlay icon={icon} pageTitle={pageTitle} />;
  }, [icon, pageTitle]);

  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: dragItemId,
    data: {
      pageId,
      pageTitle: pageTitleElement,
    },
  });

  return (
    <Collapsible.Root
      className={styles.favItemWrapper}
      data-nested={nestedItem}
      open={!collapsed}
      data-draggable={true}
      data-dragging={isDragging}
    >
      <MenuLinkItem
        data-testid={`favourite-page-${pageId}`}
        data-type="favourite-list-item"
        icon={icon}
        className={styles.favItem}
        active={active}
        to={`/workspace/${workspace.id}/${pageId}`}
        collapsed={collapsible ? collapsed : undefined}
        onCollapsedChange={setCollapsed}
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        postfix={
          <PostfixItem
            workspace={workspace}
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
              workspace={workspace}
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
