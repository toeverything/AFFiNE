import type { Tag } from '@affine/env/filter';
import { assertExists } from '@blocksuite/global/utils';
import { EdgelessIcon, PageIcon } from '@blocksuite/icons';
import type { PageMeta, Workspace } from '@blocksuite/store';
import { useBlockSuitePagePreview } from '@toeverything/hooks/use-block-suite-page-preview';
import { useBlockSuiteWorkspacePage } from '@toeverything/hooks/use-block-suite-workspace-page';
import clsx from 'clsx';
import { useAtomValue } from 'jotai';
import { Suspense, useMemo } from 'react';

import { PageGroup, pagesToPageGroups } from './page-group';
import * as styles from './page-list.css';
import type { PageListItemProps, PageListProps } from './types';

/**
 * Given a list of pages, render a list of pages
 */
export const PageList = (props: PageListProps) => {
  const groups = useMemo(() => {
    const itemListProps: PageListItemProps[] = props.pages.map(pageMeta =>
      pageMetaToPageItemProp(pageMeta, props)
    );
    const groups = pagesToPageGroups(itemListProps, props.groupBy);
    return groups;
  }, [props]);
  return (
    <div className={clsx(props.className, styles.root)}>
      {groups.map(group => (
        <PageGroup key={group.id} {...group} />
      ))}
    </div>
  );
};

interface PagePreviewInnerProps {
  workspace: Workspace;
  pageId: string;
}

const PagePreviewInner = ({ workspace, pageId }: PagePreviewInnerProps) => {
  const page = useBlockSuiteWorkspacePage(workspace, pageId);
  assertExists(page);
  const previewAtom = useBlockSuitePagePreview(page);
  const preview = useAtomValue(previewAtom);
  return preview;
};

interface PagePreviewProps {
  workspace: Workspace;
  pageId: string;
}

const PagePreview = ({ workspace, pageId }: PagePreviewProps) => {
  return (
    <Suspense>
      <PagePreviewInner workspace={workspace} pageId={pageId} />
    </Suspense>
  );
};

function tagIdToTagOption(
  tagId: string,
  blockSuiteWorkspace: Workspace
): Tag | undefined {
  return blockSuiteWorkspace.meta.properties.tags?.options.find(
    opt => opt.id === tagId
  );
}

export function pageMetaToPageItemProp(
  pageMeta: PageMeta,
  props: PageListProps
): PageListItemProps {
  const itemProps: PageListItemProps = {
    pageId: pageMeta.id,
    title: pageMeta.title,
    preview: (
      <PagePreview workspace={props.blockSuiteWorkspace} pageId={pageMeta.id} />
    ),
    createDate: new Date(pageMeta.createDate),
    updatedDate: new Date(pageMeta.updatedDate ?? pageMeta.createDate),
    to: props.renderPageAsLink
      ? `/workspace/${props.blockSuiteWorkspace.id}/page/${pageMeta.id}`
      : undefined,
    onClickPage: props.onOpenPage
      ? newTab => {
          props.onOpenPage?.(pageMeta.id, newTab);
        }
      : undefined,
    favorite: !!pageMeta.favorite,
    onToggleFavorite() {
      props.onToggleFavorite?.(pageMeta.id);
    },
    icon: props.isPreferredEdgeless?.(pageMeta.id) ? (
      <EdgelessIcon />
    ) : (
      <PageIcon />
    ),
    tags:
      pageMeta.tags
        ?.map(id => tagIdToTagOption(id, props.blockSuiteWorkspace))
        .filter((v): v is Tag => v != null) ?? [],
    operations: props.pageOperationsRenderer?.(pageMeta),
    selectable: props.selectable,
    selected: props.selectedPageIds?.includes(pageMeta.id),
    onSelectedChange: props.onSelectedPageIdsChange
      ? selected => {
          assertExists(props.selectedPageIds);
          const prevSelected = props.selectedPageIds.includes(pageMeta.id);
          const shouldAdd = selected && !prevSelected;
          const shouldRemove = !selected && prevSelected;

          if (shouldAdd) {
            props.onSelectedPageIdsChange?.([
              ...props.selectedPageIds,
              pageMeta.id,
            ]);
          } else if (shouldRemove) {
            props.onSelectedPageIdsChange?.(
              props.selectedPageIds.filter(id => id !== pageMeta.id)
            );
          }
        }
      : undefined,
    draggable: props.draggable,
    isPublicPage: !!pageMeta.isPublic,
    onDragStart: props.onDragStart
      ? () => props.onDragStart?.(pageMeta.id)
      : undefined,
    onDragEnd: props.onDragEnd
      ? () => props.onDragEnd?.(pageMeta.id)
      : undefined,
  };
  return itemProps;
}
