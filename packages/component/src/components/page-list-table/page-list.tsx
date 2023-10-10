import { DEFAULT_SORT_KEY } from '@affine/env/constant';
import type { Tag } from '@affine/env/filter';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import {
  EdgelessIcon,
  PageIcon,
  SortDownIcon,
  SortUpIcon,
} from '@blocksuite/icons';
import type { PageMeta, Workspace } from '@blocksuite/store';
import { useBlockSuitePagePreview } from '@toeverything/hooks/use-block-suite-page-preview';
import { useBlockSuiteWorkspacePage } from '@toeverything/hooks/use-block-suite-workspace-page';
import clsx from 'clsx';
import { useAtomValue } from 'jotai';
import {
  type MouseEventHandler,
  type ReactNode,
  Suspense,
  useCallback,
  useMemo,
} from 'react';

import { ScrollableContainer } from '../../ui/scrollbar';
import { useSorter } from '../page-list/use-sorter';
import { PageGroup, pagesToPageGroups } from './page-group';
import * as styles from './page-list.css';
import type { PageListItemProps, PageListProps } from './types';
import { FlexWrapper, type FlexWrapperProps } from './utils';

type Sorter = ReturnType<typeof useSorter<PageListItemProps>>;

/**
 * Given a list of pages, render a list of pages
 */
export const PageList = (props: PageListProps) => {
  const pageItems = useMemo(() => {
    return props.pages.map(pageMeta => pageMetaToPageItemProp(pageMeta, props));
  }, [props]);
  const sorter = useSorter<PageListItemProps>({
    data: pageItems,
    key: DEFAULT_SORT_KEY,
    order: 'desc',
  });
  const groupKey = useMemo(() => {
    return (
      props.groupBy ||
      (sorter.key === 'createDate' || sorter.key === 'updatedDate'
        ? sorter.key
        : // default sort
        !sorter.key
        ? DEFAULT_SORT_KEY
        : undefined)
    );
  }, [props.groupBy, sorter.key]);
  const groups = useMemo(() => {
    const groups = pagesToPageGroups(pageItems, groupKey);
    return groups;
  }, [pageItems, groupKey]);
  return (
    <div className={clsx(props.className, styles.root)}>
      <PageListHeader {...props} sorter={sorter} />
      {groups.length === 0 && props.fallback ? (
        props.fallback
      ) : (
        <ScrollableContainer>
          {groups.map(group => (
            <PageGroup key={group.id} {...group} />
          ))}
        </ScrollableContainer>
      )}
    </div>
  );
};

interface HeaderCellProps extends FlexWrapperProps {
  sortKey: Sorter['key'];
  label: ReactNode;
  sortable?: boolean;
  sorter: Sorter;
}

export const PageListHeaderCell = (props: HeaderCellProps) => {
  const onClick: MouseEventHandler = useCallback(() => {
    if (props.sortable && props.sortKey) {
      props.sorter.shiftOrder(props.sortKey);
    }
  }, [props.sortKey, props.sortable, props.sorter]);

  const sorting = props.sorter.key === props.sortKey;

  return (
    <FlexWrapper
      flex={props.flex}
      alignment={props.alignment}
      onClick={onClick}
      className={styles.headerCell}
      data-sortable={props.sortable ? true : undefined}
      data-sorting={sorting ? true : undefined}
    >
      {props.label}
      {sorting ? (
        props.sorter.order === 'asc' ? (
          <SortUpIcon />
        ) : (
          <SortDownIcon />
        )
      ) : null}
    </FlexWrapper>
  );
};

export const PageListHeader = (props: PageListProps & { sorter: Sorter }) => {
  const t = useAFFiNEI18N();
  const sorter = props.sorter;
  const headerCols = useMemo(() => {
    return [
      {
        key: 'title',
        label: t['Title'](),
        flex: 6,
      },
      {
        key: 'tags',
        label: t['Tags'](),
        flex: 3,
        alignment: 'end',
      },
      {
        key: 'createDate',
        label: t['Created'](),
        flex: 1,
        sortable: true,
        alignment: 'end',
      },
      {
        key: 'updatedDate',
        label: t['Updated'](),
        flex: 1,
        sortable: true,
        alignment: 'end',
      },
      {
        key: 'action',
        label: t['Actions'](),
        flex: 1,
        alignment: 'end',
      },
    ] as const;
  }, [t]);
  return (
    <div className={clsx(props.className, styles.header)}>
      {headerCols.map(col => {
        return (
          <PageListHeaderCell
            {...col}
            sorter={sorter}
            key={col.key}
            sortKey={col.key as Sorter['key']}
          />
        );
      })}
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
  return preview ? preview : null;
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
