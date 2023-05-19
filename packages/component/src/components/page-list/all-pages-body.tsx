import { TableBody, TableCell } from '@affine/component';
import { OperationCell } from '@affine/component/page-list';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useMediaQuery, useTheme } from '@mui/material';

import type { ListData } from './all-page';
import { FavoriteTag } from './components/favorite-tag';
import { TitleCell } from './components/title-cell';
import { StyledTableRow } from './styles';

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
          return (
            <StyledTableRow
              data-testid={`page-list-item-${pageId}`}
              key={`${pageId}-${index}`}
            >
              <TitleCell
                icon={icon}
                text={title || t['Untitled']()}
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
