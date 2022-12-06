import React from 'react';
import { Header } from '@/components/header';
import { styled } from '@/styles';
import { Table, TableCell, TableHead, TableRow, TableBody } from '../ui/table';
import { useConfirm } from '@/providers/confirm-provider';
import { IconButton } from '@/ui/button';
import { MoreVertical_24pxIcon } from '@blocksuite/icons';
import { Menu, MenuItem } from '@/ui/menu';

const StyledTableContainer = styled.div(() => {
  return {
    height: 'calc(100vh - 60px)',
    padding: '78px 72px',
    overflowY: 'auto',
  };
});

const OperationMenu = () => {
  return (
    <>
      <MenuItem>Add to favourites</MenuItem>
      <MenuItem>Open in new tab</MenuItem>
      <MenuItem>Delete</MenuItem>
    </>
  );
};

export const AllPage = () => {
  const { confirm } = useConfirm();
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
            {new Array(100).fill(0).map((_, index) => {
              return (
                <TableRow key={index}>
                  <TableCell ellipsis={true}>
                    This is a long, very long, extremely long, incredibly long,
                    exceedingly long, very long document title
                  </TableCell>
                  <TableCell ellipsis={true}>2022-11-02 18:30</TableCell>
                  <TableCell ellipsis={true}>2022-11-02 18:30</TableCell>
                  <TableCell>
                    <Menu
                      content={<OperationMenu />}
                      placement="bottom-end"
                      disablePortal={true}
                    >
                      <IconButton hoverBackground="#E0E6FF">
                        <MoreVertical_24pxIcon />
                      </IconButton>
                    </Menu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </StyledTableContainer>
    </>
  );
};

export default AllPage;
