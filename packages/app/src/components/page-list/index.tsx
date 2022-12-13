import { PageMeta, useEditor } from '@/providers/editor-provider';
import { FavouritedIcon, FavouritesIcon } from '@blocksuite/icons';
import {
  StyledFavoriteButton,
  StyledTableContainer,
  StyledTableRow,
  StyledTitleContent,
  StyledTitleWrapper,
} from './styles';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@/ui/table';
import { OperationCell, TrashOperationCell } from './operation-cell';
import Empty from './empty';
import Link from 'next/link';
import React from 'react';
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
              {isTrash ? 'Uploaded' : 'Moved to Trash'}
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
                    <Link
                      href={{ pathname: '/', query: { pageId: pageMeta.id } }}
                    >
                      <StyledTitleContent>
                        {pageMeta.title || pageMeta.id}
                      </StyledTitleContent>
                    </Link>
                    {showFavoriteTag && <FavoriteTag pageMeta={pageMeta} />}
                  </StyledTitleWrapper>
                </TableCell>
                <TableCell ellipsis={true}>{pageMeta.createDate}</TableCell>
                <TableCell ellipsis={true}>{pageMeta.createDate}</TableCell>
                <TableCell>
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
