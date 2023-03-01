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
import { PageMeta } from '@blocksuite/store';
import { useMediaQuery, useTheme as useMuiTheme } from '@mui/material';
import React, { useMemo } from 'react';

import {
  usePageMeta,
  usePageMetaHelper,
} from '../../../../hooks/use-page-meta';
import { useTheme } from '../../../../providers/ThemeProvider';
import { BlockSuiteWorkspace } from '../../../../shared';
import DateCell from './DateCell';
import Empty from './Empty';
import { OperationCell, TrashOperationCell } from './OperationCell';
import {
  StyledTableContainer,
  StyledTableRow,
  StyledTitleLink,
  StyledTitleWrapper,
} from './styles';

export type FavoriteTagProps = {
  pageMeta: PageMeta;
  onClick: () => void;
};
const FavoriteTag: React.FC<FavoriteTagProps> = ({
  pageMeta: { favorite },
  onClick,
}) => {
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
          onClick();
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

type PageListProps = {
  blockSuiteWorkspace: BlockSuiteWorkspace;
  isPublic?: boolean;
  listType?: 'all' | 'trash' | 'favorite';
  onClickPage: (pageId: string, newTab?: boolean) => void;
};

const filter = {
  all: (pageMeta: PageMeta) => !pageMeta.trash,
  trash: (pageMeta: PageMeta) => pageMeta.trash,
  favorite: (pageMeta: PageMeta) => pageMeta.favorite,
};

export const PageList: React.FC<PageListProps> = ({
  blockSuiteWorkspace,
  isPublic = false,
  listType,
  onClickPage,
}) => {
  const pageList = usePageMeta(blockSuiteWorkspace);
  const helper = usePageMetaHelper(blockSuiteWorkspace);
  const { t } = useTranslation();
  const theme = useMuiTheme();
  const matches = useMediaQuery(theme.breakpoints.up('sm'));
  const isTrash = listType === 'trash';
  const list = useMemo(
    () => pageList.filter(filter[listType ?? 'all']),
    [pageList, listType]
  );
  if (list.length === 0) {
    return <Empty listType={listType} />;
  }

  return (
    <StyledTableContainer>
      <Table>
        <TableHead>
          <TableRow>
            {matches && (
              <>
                <TableCell proportion={0.5}>{t('Title')}</TableCell>
                <TableCell proportion={0.2}>{t('Created')}</TableCell>
                <TableCell proportion={0.2}>
                  {isTrash ? t('Moved to Trash') : t('Updated')}
                </TableCell>
                <TableCell proportion={0.1}></TableCell>
              </>
            )}
          </TableRow>
        </TableHead>
        <TableBody>
          {list.map((pageMeta, index) => {
            return (
              <StyledTableRow
                data-testid={`page-list-item-${pageMeta.id}}`}
                key={`${pageMeta.id}-${index}`}
              >
                <TableCell
                  onClick={() => {
                    onClickPage(pageMeta.id);
                  }}
                >
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
                    {!isTrash && (
                      <FavoriteTag
                        onClick={() => {
                          helper.setPageMeta(pageMeta.id, {
                            favorite: !pageMeta.favorite,
                          });
                        }}
                        pageMeta={pageMeta}
                      />
                    )}
                  </StyledTitleWrapper>
                </TableCell>
                {matches && (
                  <>
                    <DateCell
                      pageMeta={pageMeta}
                      dateKey="createDate"
                      onClick={() => {
                        onClickPage(pageMeta.id);
                      }}
                    />
                    <DateCell
                      pageMeta={pageMeta}
                      dateKey={isTrash ? 'trashDate' : 'updatedDate'}
                      backupKey={isTrash ? 'trashDate' : 'createDate'}
                      onClick={() => {
                        onClickPage(pageMeta.id);
                      }}
                    />
                    {!isPublic && (
                      <TableCell
                        style={{ padding: 0 }}
                        data-testid={`more-actions-${pageMeta.id}`}
                      >
                        {isTrash ? (
                          <TrashOperationCell
                            pageMeta={pageMeta}
                            onPermanentlyDeletePage={pageId => {
                              blockSuiteWorkspace.removePage(pageId);
                            }}
                            onRestorePage={() => {
                              helper.setPageMeta(pageMeta.id, {
                                trash: false,
                              });
                            }}
                            onOpenPage={pageId => {
                              onClickPage(pageId, false);
                            }}
                          />
                        ) : (
                          <OperationCell
                            pageMeta={pageMeta}
                            onOpenPageInNewTab={pageId => {
                              onClickPage(pageId, true);
                            }}
                            onToggleFavoritePage={(pageId: string) => {
                              helper.setPageMeta(pageId, {
                                favorite: !pageMeta.favorite,
                              });
                            }}
                            onToggleTrashPage={() => {
                              helper.setPageMeta(pageMeta.id, {
                                trash: !pageMeta.trash,
                              });
                            }}
                          />
                        )}
                      </TableCell>
                    )}
                  </>
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
