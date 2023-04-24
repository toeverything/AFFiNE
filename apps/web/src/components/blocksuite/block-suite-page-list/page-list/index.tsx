import {
  Content,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
} from '@affine/component';
import { useTranslation } from '@affine/i18n';
import {
  EdgelessIcon,
  FavoritedIcon,
  FavoriteIcon,
  PageIcon,
} from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import { useMediaQuery, useTheme } from '@mui/material';
import {
  useBlockSuitePageMeta,
  usePageMetaHelper,
} from '@toeverything/hooks/use-block-suite-page-meta';
import { useAtomValue } from 'jotai';
import type React from 'react';
import { useMemo } from 'react';

import { workspacePreferredModeAtom } from '../../../../atoms';
import { useBlockSuiteMetaHelper } from '../../../../hooks/affine/use-block-suite-meta-helper';
import type { BlockSuiteWorkspace } from '../../../../shared';
import { toast } from '../../../../utils';
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
  const { t } = useTranslation();
  return (
    <Tooltip
      content={favorite ? t('Favorited') : t('Favorite')}
      placement="top-start"
    >
      <IconButton
        iconSize={[20, 20]}
        onClick={e => {
          e.stopPropagation();
          onClick();
          toast(
            favorite ? t('Removed from Favorites') : t('Added to Favorites')
          );
        }}
        style={{
          color: favorite
            ? 'var(--affine-primary-color)'
            : 'var(--affine-icon-color)',
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
  listType?: 'all' | 'trash' | 'favorite' | 'shared';
  onClickPage: (pageId: string, newTab?: boolean) => void;
};

const filter = {
  all: (pageMeta: PageMeta) => !pageMeta.trash,
  trash: (pageMeta: PageMeta, allMetas: PageMeta[]) => {
    const parentMeta = allMetas.find(m => m.subpageIds?.includes(pageMeta.id));
    return !parentMeta?.trash && pageMeta.trash;
  },
  favorite: (pageMeta: PageMeta) => pageMeta.favorite && !pageMeta.trash,
  shared: (pageMeta: PageMeta) => pageMeta.isPublic && !pageMeta.trash,
};

export const PageList: React.FC<PageListProps> = ({
  blockSuiteWorkspace,
  isPublic = false,
  listType,
  onClickPage,
}) => {
  const pageList = useBlockSuitePageMeta(blockSuiteWorkspace);
  const helper = usePageMetaHelper(blockSuiteWorkspace);
  const { removeToTrash, restoreFromTrash } =
    useBlockSuiteMetaHelper(blockSuiteWorkspace);
  const { t } = useTranslation();
  const theme = useTheme();
  const matches = useMediaQuery(theme.breakpoints.up('sm'));
  const isTrash = listType === 'trash';
  const isShared = listType === 'shared';
  const record = useAtomValue(workspacePreferredModeAtom);
  const list = useMemo(
    () =>
      pageList.filter(pageMeta =>
        filter[listType ?? 'all'](pageMeta, pageList)
      ),
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
                  {isTrash
                    ? t('Moved to Trash')
                    : isShared
                    ? 'Shared'
                    : t('Updated')}
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
                data-testid={`page-list-item-${pageMeta.id}`}
                key={`${pageMeta.id}-${index}`}
              >
                <TableCell
                  onClick={() => {
                    onClickPage(pageMeta.id);
                  }}
                >
                  <StyledTitleWrapper>
                    <StyledTitleLink>
                      {record[pageMeta.id] === 'edgeless' ? (
                        <EdgelessIcon />
                      ) : (
                        <PageIcon />
                      )}
                      <Content ellipsis={true} color="inherit">
                        {pageMeta.title || t('Untitled')}
                      </Content>
                    </StyledTitleLink>
                    {listType && !isTrash && (
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
                              restoreFromTrash(pageMeta.id);
                            }}
                            onOpenPage={pageId => {
                              onClickPage(pageId, false);
                            }}
                          />
                        ) : (
                          <OperationCell
                            pageMeta={pageMeta}
                            metas={pageList}
                            blockSuiteWorkspace={blockSuiteWorkspace}
                            onOpenPageInNewTab={pageId => {
                              onClickPage(pageId, true);
                            }}
                            onToggleFavoritePage={(pageId: string) => {
                              helper.setPageMeta(pageId, {
                                favorite: !pageMeta.favorite,
                              });
                            }}
                            onToggleTrashPage={(pageId, isTrash) => {
                              if (isTrash) {
                                removeToTrash(pageId);
                              } else {
                                restoreFromTrash(pageId);
                              }
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
