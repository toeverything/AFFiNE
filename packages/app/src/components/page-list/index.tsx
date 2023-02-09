import { PageMeta } from '@/providers/app-state-provider';
import {
  FavouritedIcon,
  FavouritesIcon,
  PaperIcon,
  EdgelessIcon,
} from '@blocksuite/icons';
import {
  StyledTableContainer,
  StyledTableRow,
  StyledTitleLink,
  StyledTitleWrapper,
} from './styles';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@affine/component';
import { OperationCell, TrashOperationCell } from './OperationCell';
import Empty from './Empty';
import { Content } from '@affine/component';
import React from 'react';
import DateCell from '@/components/page-list/DateCell';
import { IconButton } from '@affine/component';
import { Tooltip } from '@affine/component';
import { useRouter } from 'next/router';
import { useAppState } from '@/providers/app-state-provider';
import { toast } from '@affine/component';
import { usePageHelper } from '@/hooks/use-page-helper';
import { useTheme } from '@/providers/ThemeProvider';
import { useTranslation } from '@affine/i18n';
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
          <FavouritedIcon data-testid="favorited-icon" />
        ) : (
          <FavouritesIcon />
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
  const { currentWorkspace } = useAppState();
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
            return (
              <StyledTableRow
                key={`${pageMeta.id}-${index}`}
                onClick={() => {
                  if (isPublic) {
                    router.push(
                      `/public-workspace/${router.query.workspaceId}/${pageMeta.id}`
                    );
                  } else {
                    router.push(
                      `/workspace/${currentWorkspace?.id}/${pageMeta.id}`
                    );
                  }
                }}
              >
                <TableCell>
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
                <DateCell pageMeta={pageMeta} dateKey="createDate" />
                <DateCell
                  pageMeta={pageMeta}
                  dateKey={isTrash ? 'trashDate' : 'updatedDate'}
                  backupKey={isTrash ? 'trashDate' : 'createDate'}
                />
                {!isPublic ? (
                  <TableCell
                    style={{ padding: 0 }}
                    data-testid={`more-actions-${pageMeta.id}`}
                    onClick={e => {
                      e.stopPropagation();
                    }}
                  >
                    {isTrash ? (
                      <TrashOperationCell pageMeta={pageMeta} />
                    ) : (
                      <OperationCell pageMeta={pageMeta} />
                    )}
                  </TableCell>
                ) : null}
              </StyledTableRow>
            );
          })}
        </TableBody>
      </Table>
    </StyledTableContainer>
  );
};

export default PageList;
