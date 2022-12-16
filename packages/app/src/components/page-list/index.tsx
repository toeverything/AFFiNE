import { PageMeta, useEditor } from '@/providers/editor-provider';
import {
  FavouritedIcon,
  FavouritesIcon,
  PaperIcon,
  EdgelessIcon,
} from '@blocksuite/icons';
import {
  StyledFavoriteButton,
  StyledTableContainer,
  StyledTableRow,
  StyledTitleLink,
  StyledTitleWrapper,
} from './styles';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@/ui/table';
import { OperationCell, TrashOperationCell } from './operation-cell';
import Empty from './empty';
import { Content } from '@/ui/layout';
import React from 'react';
import DateCell from '@/components/page-list/date-cell';
const FavoriteTag = ({ pageMeta }: { pageMeta: PageMeta }) => {
  const { toggleFavoritePage } = useEditor();

  return (
    <StyledFavoriteButton
      className="favorite-button"
      favorite={pageMeta.favorite}
      onClick={() => {
        toggleFavoritePage(pageMeta.id);
      }}
    >
      {pageMeta.favorite ? <FavouritedIcon /> : <FavouritesIcon />}
    </StyledFavoriteButton>
  );
};

export const PageList = ({
  pageList,
  showFavoriteTag = false,
  isTrash = false,
}: {
  pageList: PageMeta[];
  showFavoriteTag?: boolean;
  isTrash?: boolean;
}) => {
  if (pageList.length === 0) {
    return <Empty />;
  }

  return (
    <StyledTableContainer>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell proportion={0.5}>Documents</TableCell>
            <TableCell proportion={0.2}>Created</TableCell>
            <TableCell proportion={0.2}>
              {isTrash ? 'Moved to Trash' : 'Updated'}
            </TableCell>
            <TableCell proportion={0.1}></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {pageList.map((pageMeta, index) => {
            return (
              <StyledTableRow key={`${pageMeta.id}-${index}`}>
                <TableCell>
                  <StyledTitleWrapper>
                    <StyledTitleLink
                      href={{ pathname: '/', query: { pageId: pageMeta.id } }}
                    >
                      {pageMeta.mode === 'edgeless' ? (
                        <EdgelessIcon />
                      ) : (
                        <PaperIcon />
                      )}
                      <Content ellipsis={true} color="inherit">
                        {pageMeta.title || 'Untitled'}
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
                <TableCell style={{ padding: 0 }}>
                  {isTrash ? (
                    <TrashOperationCell pageMeta={pageMeta} />
                  ) : (
                    <OperationCell pageMeta={pageMeta} />
                  )}
                </TableCell>
              </StyledTableRow>
            );
          })}
        </TableBody>
      </Table>
    </StyledTableContainer>
  );
};

export default PageList;
