import type { IconButtonProps } from '@affine/component';
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
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  EdgelessIcon,
  FavoritedIcon,
  FavoriteIcon,
  PageIcon,
} from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import { useAtomValue } from 'jotai';
import { forwardRef } from 'react';

import { workspacePreferredModeAtom } from '../../../../atoms';
import { useBlockSuiteMetaHelper } from '../../../../hooks/affine/use-block-suite-meta-helper';
import type { BlockSuiteWorkspace } from '../../../../shared';
import { toast } from '../../../../utils';
import DateCell from './DateCell';
import { OperationCell, TrashOperationCell } from './OperationCell';
import {
  StyledTableContainer,
  StyledTableRow,
  StyledTitleLink,
  StyledTitleWrapper,
} from './styles';

export type FavoriteTagProps = {
  active: boolean;
};

// eslint-disable-next-line react/display-name
const FavoriteTag = forwardRef<
  HTMLButtonElement,
  FavoriteTagProps & Omit<IconButtonProps, 'children'>
>(({ active, ...props }, ref) => {
  const { t } = useTranslation();
  return (
    <Tooltip
      content={active ? t('Favorited') : t('Favorite')}
      placement="top-start"
    >
      <IconButton
        ref={ref}
        iconSize={[20, 20]}
        style={{
          color: active
            ? 'var(--affine-primary-color)'
            : 'var(--affine-icon-color)',
        }}
        {...props}
      >
        {active ? (
          <FavoritedIcon data-testid="favorited-icon" />
        ) : (
          <FavoriteIcon />
        )}
      </IconButton>
    </Tooltip>
  );
});

type PageListProps = {
  blockSuiteWorkspace: BlockSuiteWorkspace;
  isPublic?: boolean;
  list: PageMeta[];
  listType: 'all' | 'trash' | 'favorite' | 'shared' | 'public';
  onClickPage: (pageId: string, newTab?: boolean) => void;
};

export const PageList: React.FC<PageListProps> = ({
  blockSuiteWorkspace,
  isPublic = false,
  list,
  listType,
  onClickPage,
}) => {
  const { toggleFavorite, removeToTrash, restoreFromTrash } =
    useBlockSuiteMetaHelper(blockSuiteWorkspace);
  const { t } = useTranslation();
  const record = useAtomValue(workspacePreferredModeAtom);

  const isTrash = listType === 'trash';
  const isShared = listType === 'shared';

  const ListHead = () => (
    <TableHead>
      <TableRow>
        <TableCell proportion={0.5}>{t('Title')}</TableCell>
        <TableCell proportion={0.2}>{t('Created')}</TableCell>
        <TableCell proportion={0.2}>
          {isTrash ? t('Moved to Trash') : isShared ? 'Shared' : t('Updated')}
        </TableCell>
        <TableCell proportion={0.1}></TableCell>
      </TableRow>
    </TableHead>
  );

  return (
    <StyledTableContainer>
      <Table>
        <ListHead />
        <TableBody>
          {list.map((pageMeta, index) => {
            const bookmarkPage = (e: React.MouseEvent) => {
              e.stopPropagation();
              toggleFavorite(pageMeta.id);
              toast(
                pageMeta.favorite
                  ? t('Removed from Favorites')
                  : t('Added to Favorites')
              );
            };

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
                        {pageMeta.title || t['Untitled']()}
                      </Content>
                    </StyledTitleLink>
                    {!isTrash && (
                      <FavoriteTag
                        className={pageMeta.favorite ? '' : 'favorite-button'}
                        onClick={bookmarkPage}
                        active={!!pageMeta.favorite}
                      />
                    )}
                  </StyledTitleWrapper>
                </TableCell>
                <DateCell
                  date={pageMeta['createDate']}
                  onClick={() => {
                    onClickPage(pageMeta.id);
                  }}
                />
                <DateCell
                  date={
                    isTrash
                      ? pageMeta['trashDate']
                      : pageMeta['updatedDate'] ?? pageMeta['createDate']
                  }
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
                        blockSuiteWorkspace={blockSuiteWorkspace}
                        onOpenPageInNewTab={pageId => {
                          onClickPage(pageId, true);
                        }}
                        onToggleFavoritePage={(pageId: string) => {
                          toggleFavorite(pageId);
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
              </StyledTableRow>
            );
          })}
        </TableBody>
      </Table>
    </StyledTableContainer>
  );
};

export const PageListMobileView: React.FC<
  Pick<PageListProps, 'list' | 'onClickPage'>
> = ({ list, onClickPage }) => {
  const { t } = useTranslation();
  const record = useAtomValue(workspacePreferredModeAtom);

  const ListItems = list.map((pageMeta, index) => {
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
            {/* {!isTrash && (
              <FavoriteTag
                className={pageMeta.favorite ? '' : 'favorite-button'}
                onClick={bookmarkPage}
                active={!!pageMeta.favorite}
              />
            )} */}
          </StyledTitleWrapper>
        </TableCell>
      </StyledTableRow>
    );
  });

  return (
    <StyledTableContainer>
      <Table>
        <TableBody>{ListItems}</TableBody>
      </Table>
    </StyledTableContainer>
  );
};

export default PageList;
