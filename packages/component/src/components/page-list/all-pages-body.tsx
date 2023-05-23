import { TableBody, TableCell } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useDraggable } from '@dnd-kit/core';
import { useMediaQuery, useTheme } from '@mui/material';

import { FavoriteTag } from './components/favorite-tag';
import { TitleCell } from './components/title-cell';
import { OperationCell } from './operation-cell';
import { StyledTableRow } from './styles';
import type { DraggableTitleCellData, ListData } from './type';

export const AllPagesBody = ({
  isPublicWorkspace,
  data,
}: {
  isPublicWorkspace: boolean;
  data: ListData[];
}) => {
  const t = useAFFiNEI18N();
  const theme = useTheme();
  const isSmallDevices = useMediaQuery(theme.breakpoints.down('sm'));
  return (
    <TableBody>
      {data.map(
        (
          {
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
            <StyledTableRow
              data-testid={`page-list-item-${pageId}`}
              key={`${pageId}-${index}`}
            >
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
              >
                {createDate}
              </TableCell>
              <TableCell
                data-testid="updated-date"
                ellipsis={true}
                hidden={isSmallDevices}
                onClick={onClickPage}
              >
                {updatedDate ?? createDate}
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
