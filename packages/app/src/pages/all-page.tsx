import React from 'react';
import { Header } from '@/components/header';
import { displayFlex, styled, textEllipsis } from '@/styles';
import { Table, TableCell, TableHead, TableRow, TableBody } from '../ui/table';
import { useConfirm } from '@/providers/confirm-provider';
import { IconButton } from '@/ui/button';
import { MoreVertical_24pxIcon } from '@blocksuite/icons';
import { Menu, MenuItem } from '@/ui/menu';
import { PageMeta, useEditor } from '@/providers/editor-provider';
import { Wrapper } from '@/ui/Layout';

import {
  MiddleFavouritesIcon,
  MiddleFavouritedStatus2Icon,
} from '@blocksuite/icons';

const StyledTableContainer = styled.div(() => {
  return {
    height: 'calc(100vh - 60px)',
    padding: '78px 72px',
    overflowY: 'auto',
  };
});
const StyledTitleWrapper = styled.div(({ theme }) => {
  return {
    ...displayFlex('flex-start', 'center'),
    'favorite-heart': {},
  };
});
const StyledTitleContent = styled.div(({ theme }) => {
  return {
    maxWidth: '90%',
    marginRight: '18px',
    ...textEllipsis(1),
  };
});
const StyledFavoriteButton = styled.button<{ favorite: boolean }>(
  ({ theme, favorite }) => {
    return {
      width: '32px',
      height: '32px',
      justifyContent: 'center',
      alignItems: 'center',
      display: 'none',
      color: favorite ? theme.colors.primaryColor : theme.colors.iconColor,
      '&:hover': {
        color: theme.colors.primaryColor,
      },
    };
  }
);
const StyledTableRow = styled(TableRow)(({ theme }) => {
  return {
    '&:hover': {
      '.favorite-button': {
        display: 'flex',
      },
    },
  };
});

const OperationArea = ({ pageMeta }: { pageMeta: PageMeta }) => {
  const { id, favorite } = pageMeta;
  const { openPage, toggleFavoritePage, toggleDeletePage } = useEditor();

  const OperationMenu = (
    <>
      <MenuItem
        onClick={() => {
          toggleFavoritePage(id);
        }}
      >
        {favorite ? 'Remove' : 'Add'} to favourites
      </MenuItem>
      <MenuItem
        onClick={() => {
          openPage(id);
        }}
      >
        Open in new tab
      </MenuItem>
      <MenuItem
        onClick={() => {
          toggleDeletePage(id);
        }}
      >
        Delete
      </MenuItem>
    </>
  );
  return (
    <Wrapper alignItems="center" justifyContent="center">
      <Menu content={OperationMenu} placement="bottom-end" disablePortal={true}>
        <IconButton hoverBackground="#E0E6FF">
          <MoreVertical_24pxIcon />
        </IconButton>
      </Menu>
    </Wrapper>
  );
};

export const AllPage = () => {
  const { confirm } = useConfirm();
  const { pageList, toggleFavoritePage } = useEditor();
  return (
    <>
      <Header />
      <button
        onClick={() => {
          confirm({
            title: 'Permanently delete',
            content: "Once deleted, you can't undo this action.Do you confirm?",
            confirmText: 'Delete',
            confirmType: 'danger',
          });
        }}
      >
        click to show confirm
      </button>
      <StyledTableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell proportion={0.5}>Documents</TableCell>
              <TableCell proportion={0.2}>Created</TableCell>
              <TableCell proportion={0.2}>Uploaded</TableCell>
              <TableCell proportion={0.1}></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pageList.map((pageMeta, index) => {
              return (
                <StyledTableRow key={`${pageMeta.id}-${index}`}>
                  <TableCell>
                    <StyledTitleWrapper>
                      <StyledTitleContent>
                        {pageMeta.title || pageMeta.id}
                      </StyledTitleContent>
                      <StyledFavoriteButton
                        className="favorite-button"
                        favorite={pageMeta.favorite}
                        onClick={() => {
                          toggleFavoritePage(pageMeta.id);
                        }}
                      >
                        {pageMeta.favorite ? (
                          <MiddleFavouritedStatus2Icon />
                        ) : (
                          <MiddleFavouritesIcon />
                        )}
                      </StyledFavoriteButton>
                    </StyledTitleWrapper>
                  </TableCell>
                  <TableCell ellipsis={true}>{pageMeta.createDate}</TableCell>
                  <TableCell ellipsis={true}>{pageMeta.createDate}</TableCell>
                  <TableCell>
                    <OperationArea pageMeta={pageMeta} />
                  </TableCell>
                </StyledTableRow>
              );
            })}
          </TableBody>
        </Table>
      </StyledTableContainer>
    </>
  );
};

export default AllPage;
