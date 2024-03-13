import { useBlockSuitePageReferences } from '@affine/core/hooks/use-block-suite-page-references';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { EdgelessIcon, PageIcon } from '@blocksuite/icons';
import type { DocCollection, DocMeta } from '@blocksuite/store';
import { useDraggable } from '@dnd-kit/core';
import * as Collapsible from '@radix-ui/react-collapsible';
import { PageRecordList, useLiveData, useService } from '@toeverything/infra';
import React, { useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';

import { getDragItemId } from '../../../../hooks/affine/use-sidebar-drag';
import { useNavigateHelper } from '../../../../hooks/use-navigate-helper';
import { MenuItem as CollectionItem } from '../../../app-sidebar';
import { DragMenuItemOverlay } from '../components/drag-menu-item-overlay';
import { PostfixItem } from '../components/postfix-item';
import { ReferencePage } from '../components/reference-page';
import * as styles from './styles.css';

export const Page = ({
  page,
  docCollection,
  allPageMeta,
  inAllowList,
  removeFromAllowList,
}: {
  page: DocMeta;
  inAllowList: boolean;
  removeFromAllowList: (id: string) => void;
  docCollection: DocCollection;
  allPageMeta: Record<string, DocMeta>;
}) => {
  const [collapsed, setCollapsed] = React.useState(true);
  const params = useParams();

  const t = useAFFiNEI18N();

  const pageId = page.id;
  const active = params.pageId === pageId;
  const pageRecord = useLiveData(useService(PageRecordList).record(pageId));
  const pageMode = useLiveData(pageRecord?.mode);
  const dragItemId = getDragItemId('collectionPage', pageId);

  const icon = useMemo(() => {
    return pageMode === 'edgeless' ? <EdgelessIcon /> : <PageIcon />;
  }, [pageMode]);

  const { jumpToPage } = useNavigateHelper();
  const clickPage = useCallback(() => {
    jumpToPage(docCollection.id, page.id);
  }, [jumpToPage, page.id, docCollection.id]);

  const references = useBlockSuitePageReferences(docCollection, pageId);
  const referencesToRender = references.filter(
    id => allPageMeta[id] && !allPageMeta[id]?.trash
  );

  const pageTitle = page.title || t['Untitled']();
  const pageTitleElement = useMemo(() => {
    return <DragMenuItemOverlay icon={icon} pageTitle={pageTitle} />;
  }, [icon, pageTitle]);

  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: dragItemId,
    data: {
      pageId,
      pageTitle: pageTitleElement,
      removeFromCollection: () => removeFromAllowList(pageId),
    },
  });

  return (
    <Collapsible.Root
      open={!collapsed}
      data-draggable={true}
      data-dragging={isDragging}
    >
      <CollectionItem
        data-testid="collection-page"
        data-type="collection-list-item"
        icon={icon}
        onClick={clickPage}
        className={styles.title}
        active={active}
        collapsed={referencesToRender.length > 0 ? collapsed : undefined}
        onCollapsedChange={setCollapsed}
        postfix={
          <PostfixItem
            docCollection={docCollection}
            pageId={pageId}
            pageTitle={pageTitle}
            removeFromAllowList={removeFromAllowList}
            inAllowList={inAllowList}
          />
        }
        ref={setNodeRef}
        {...attributes}
        {...listeners}
      >
        {page.title || t['Untitled']()}
      </CollectionItem>
      <Collapsible.Content className={styles.collapsibleContent}>
        {referencesToRender.map(id => {
          return (
            <ReferencePage
              key={id}
              docCollection={docCollection}
              pageId={id}
              metaMapping={allPageMeta}
              parentIds={new Set([pageId])}
            />
          );
        })}
      </Collapsible.Content>
    </Collapsible.Root>
  );
};
