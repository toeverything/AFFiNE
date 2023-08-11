import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useDraggable } from '@dnd-kit/core';
import type { ReactNode } from 'react';
import { Fragment } from 'react';

import { styled } from '../../styles';
import { TableCell } from '../../ui/table';
import { FavoriteTag } from './components/favorite-tag';
import { Tags } from './components/tags';
import { TitleCell } from './components/title-cell';
import { OperationCell } from './operation-cell';
import { StyledTableBodyRow } from './styles';
import type { DateKey, DraggableTitleCellData, ListData } from './type';
import { useDateGroup } from './use-date-group';
import { formatDate, useIsSmallDevices } from './utils';

export const GroupRow = ({ children }: { children: ReactNode }) => {
  return (
    <StyledTableBodyRow>
      <TableCell
        style={{
          color: 'var(--affine-text-secondary-color)',
          fontSize: 'var(--affine-font-sm)',
          background: 'initial',
          cursor: 'default',
        }}
      >
        {children}
      </TableCell>
    </StyledTableBodyRow>
  );
};

export const AllPagesBody = ({
  index,
  data: { isPublicWorkspace, data, groupKey },
}: {
  index: number;
  data: {
    isPublicWorkspace: boolean;
    data: ListData[];
    groupKey?: DateKey;
  };
}) => {
  const t = useAFFiNEI18N();
  const isSmallDevices = useIsSmallDevices();
  const dataWithGroup = useDateGroup({ data, key: groupKey });

  const {
    groupName,
    pageId,
    title,
    preview,
    tags,
    icon,
    isPublicPage,
    favorite,
    createDate,
    updatedDate,
    onClickPage,
    bookmarkPage,
    onOpenPageInNewTab,
    removeToTrash,
    onDisablePublicSharing,
  } = dataWithGroup[index];
  const displayTitle = title || t['Untitled']();
  return (
    <Fragment key={pageId}>
      {groupName &&
        (index === 0 || dataWithGroup[index - 1].groupName !== groupName) && (
          <GroupRow>{groupName}</GroupRow>
        )}
      <StyledTableBodyRow data-testid={`page-list-item-${pageId}`}>
        <DraggableTitleCell
          pageId={pageId}
          draggableData={{
            pageId,
            pageTitle: displayTitle,
            icon,
          }}
          proportion={0.5}
          icon={icon}
          text={displayTitle}
          desc={preview}
          data-testid="title"
          onClick={onClickPage}
        />
        <TableCell
          proportion={0.2}
          data-testid="tags"
          hidden={isSmallDevices}
          onClick={onClickPage}
          style={{ fontSize: 'var(--affine-font-xs)' }}
        >
          <Tags value={tags}></Tags>
        </TableCell>
        <TableCell
          data-testid="created-date"
          ellipsis={true}
          hidden={isSmallDevices}
          onClick={onClickPage}
          style={{ fontSize: 'var(--affine-font-xs)', width: '110px' }}
        >
          {formatDate(createDate)}
        </TableCell>
        <TableCell
          data-testid="updated-date"
          ellipsis={true}
          hidden={isSmallDevices}
          onClick={onClickPage}
          style={{ fontSize: 'var(--affine-font-xs)', width: '110px' }}
        >
          {formatDate(updatedDate ?? createDate)}
        </TableCell>
        {!isPublicWorkspace && (
          <TableCell
            style={{
              padding: 0,
              width: '140px',
            }}
            data-testid={`more-actions-${pageId}`}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <FavoriteTag
                className={favorite ? '' : 'favorite-button'}
                onClick={bookmarkPage}
                active={!!favorite}
              />
              <OperationCell
                title={title}
                favorite={favorite}
                isPublic={isPublicPage}
                onOpenPageInNewTab={onOpenPageInNewTab}
                onToggleFavoritePage={bookmarkPage}
                onRemoveToTrash={removeToTrash}
                onDisablePublicSharing={onDisablePublicSharing}
              />
            </div>
          </TableCell>
        )}
      </StyledTableBodyRow>
    </Fragment>
  );
};

const FullSizeButton = styled('button')(() => ({
  width: '100%',
  height: '100%',
  display: 'block',
}));

type DraggableTitleCellProps = {
  pageId: string;
  draggableData?: DraggableTitleCellData;
} & React.ComponentProps<typeof TitleCell>;

function DraggableTitleCell({
  pageId,
  draggableData,
  ...props
}: DraggableTitleCellProps) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: 'page-list-item-title-' + pageId,
    data: draggableData,
  });

  return (
    <TitleCell
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.5 : 1 }}
      {...props}
    >
      {/* Use `button` for draggable element */}
      {/* See https://docs.dndkit.com/api-documentation/draggable/usedraggable#role */}
      {element => (
        <FullSizeButton {...listeners} {...attributes}>
          {element}
        </FullSizeButton>
      )}
    </TitleCell>
  );
}
