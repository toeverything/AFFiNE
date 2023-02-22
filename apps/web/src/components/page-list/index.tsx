import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@affine/component';
import { Content, IconButton, toast, Tooltip } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import {
  EdgelessIcon,
  FavoritedIcon,
  FavoriteIcon,
  PaperIcon,
} from '@blocksuite/icons';
import { useRouter } from 'next/router';
import React, { useCallback } from 'react';

import DateCell from '@/components/page-list/DateCell';
import { usePageHelper } from '@/hooks/use-page-helper';
import { PageMeta } from '@/providers/app-state-provider';
import { useTheme } from '@/providers/ThemeProvider';
import { useGlobalState } from '@/store/app';

import Empty from './Empty';
import { OperationCell, TrashOperationCell } from './OperationCell';
import {
  StyledTableContainer,
  StyledTableRow,
  StyledTitleLink,
  StyledTitleWrapper,
} from './styles';
const FavoriteTag = ({
  pageMeta: { favorite, id },
}: {
  pageMeta: PageMeta;
}) => {
  const { toggleFavoritePage } = usePageHelper();
  const { theme } = useTheme();
  const { t } = useTranslation();
  return (
    <Tooltip
      content={favorite ? t('Favorited') : t('Favorite')}
      placement="top-start"
    >
      <IconButton
        darker={true}
        iconSize={[20, 20]}
        onClick={e => {
          e.stopPropagation();
          toggleFavoritePage(id);
          toast(
            favorite ? t('Removed from Favorites') : t('Added to Favorites')
          );
        }}
        style={{
          color: favorite ? theme.colors.primaryColor : theme.colors.iconColor,
        }}
        className={favorite ? '' : 'favorite-button'}
      >
        {favorite ? (
          <FavoritedIcon data-testid="favorited-icon" />
        ) : (
          <FavoriteIcon />
        )}
      </IconButton>
    </Tooltip>
  );
};

export const PageList = ({
  pageList,
  showFavoriteTag = false,
  isTrash = false,
  isPublic = false,
  listType,
}: {
  pageList: PageMeta[];
  showFavoriteTag?: boolean;
  isTrash?: boolean;
  isPublic?: boolean;
  listType?: 'all' | 'trash' | 'favorite';
}) => {
  const router = useRouter();
  const currentWorkspace = useGlobalState(
    useCallback(store => store.currentDataCenterWorkspace, [])
  );
  const { t } = useTranslation();
  if (pageList.length === 0) {
    return <Empty listType={listType} />;
  }

  return (
    <StyledTableContainer>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell proportion={0.5}>{t('Title')}</TableCell>
            <TableCell proportion={0.2}>{t('Created')}</TableCell>
            <TableCell proportion={0.2}>
              {isTrash ? t('Moved to Trash') : t('Updated')}
            </TableCell>
            <TableCell proportion={0.1}></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {pageList.map((pageMeta, index) => {
            // On click event must be set on the table cell, since the last operation cell is not clickable, and if set on the row, the menu will have bug on close.
            const onClick = () => {
              if (isPublic) {
                router.push(
                  `/public-workspace/${router.query.workspaceId}/${pageMeta.id}`
                );
              } else {
                router.push(
                  `/workspace/${currentWorkspace?.id}/${pageMeta.id}`
                );
              }
            };
            return (
              <StyledTableRow
                data-testid="page-list-item"
                key={`${pageMeta.id}-${index}`}
              >
                <TableCell onClick={onClick}>
                  <StyledTitleWrapper>
                    <StyledTitleLink>
                      {pageMeta.mode === 'edgeless' ? (
                        <EdgelessIcon />
                      ) : (
                        <PaperIcon />
                      )}
                      <Content ellipsis={true} color="inherit">
                        {pageMeta.title || t('Untitled')}
                      </Content>
                    </StyledTitleLink>
                    {showFavoriteTag && <FavoriteTag pageMeta={pageMeta} />}
                  </StyledTitleWrapper>
                </TableCell>
                <DateCell
                  pageMeta={pageMeta}
                  dateKey="createDate"
                  onClick={onClick}
                />
                <DateCell
                  pageMeta={pageMeta}
                  dateKey={isTrash ? 'trashDate' : 'updatedDate'}
                  backupKey={isTrash ? 'trashDate' : 'createDate'}
                  onClick={onClick}
                />
                {!isPublic && (
                  <TableCell
                    style={{ padding: 0 }}
                    data-testid={`more-actions-${pageMeta.id}`}
                  >
                    {isTrash ? (
                      <TrashOperationCell pageMeta={pageMeta} />
                    ) : (
                      <OperationCell pageMeta={pageMeta} />
                    )}
                  </TableCell>
                )}
              </StyledTableRow>
            );
          })}
        </TableBody>
      </Table>
    </StyledTableContainer>
  );
};

export default PageList;
