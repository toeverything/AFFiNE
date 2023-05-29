import { TableBody, TableCell } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useDraggable } from '@dnd-kit/core';
import { useMediaQuery, useTheme } from '@mui/material';
import type { ReactNode } from 'react';
import { Fragment } from 'react';

import { FavoriteTag } from './components/favorite-tag';
import { TitleCell } from './components/title-cell';
import { OperationCell } from './operation-cell';
import { StyledTableRow } from './styles';
import type { DateKey, DraggableTitleCellData, ListData } from './type';
import { useDateGroup } from './use-date-group';
import { formatDate } from './utils';

export const GroupRow = ({ children }: { children: ReactNode }) => {
  return (
    <StyledTableRow>
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
    </StyledTableRow>
  );
};

export const AllPagesBody = ({
  isPublicWorkspace,
  data,
  groupKey,
}: {
  isPublicWorkspace: boolean;
  data: ListData[];
  groupKey?: DateKey;
}) => {
  const t = useAFFiNEI18N();
  const theme = useTheme();
  const isSmallDevices = useMediaQuery(theme.breakpoints.down('sm'));
  const dataWithGroup = useDateGroup({ data, key: groupKey });
  return (
    <TableBody>
      {dataWithGroup.map(
        (
          {
            groupName,
            pageId,
            title,
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
          },
          index
        ) => {
          const displayTitle = title || t['Untitled']();
          return (
            <Fragment key={pageId}>
              {groupName &&
                (index === 0 ||
                  dataWithGroup[index - 1].groupName !== groupName) && (
                  <GroupRow>{groupName}</GroupRow>
                )}
              <StyledTableRow data-testid={`page-list-item-${pageId}`}>
                <DraggableTitleCell
                  pageId={pageId}
                  draggableData={{
                    pageId,
                    pageTitle: displayTitle,
                    icon,
                  }}
                  icon={icon}
                  text={displayTitle}
                  data-testid="title"
                  onClick={onClickPage}
                />
                <TableCell
                  data-testid="created-date"
                  ellipsis={true}
                  hidden={isSmallDevices}
                  onClick={onClickPage}
                  style={{ fontSize: 'var(--affine-font-xs)' }}
                >
                  {formatDate(createDate)}
                </TableCell>
                <TableCell
                  data-testid="updated-date"
                  ellipsis={true}
                  hidden={isSmallDevices}
                  onClick={onClickPage}
                  style={{ fontSize: 'var(--affine-font-xs)' }}
                >
                  {formatDate(updatedDate ?? createDate)}
                </TableCell>
                {!isPublicWorkspace && (
                  <TableCell
                    style={{
                      padding: 0,
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                    data-testid={`more-actions-${pageId}`}
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
                  </TableCell>
                )}
              </StyledTableRow>
            </Fragment>
          );
        }
      )}
    </TableBody>
  );
};

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
      {...listeners}
      {...attributes}
      {...props}
    />
  );
}
