import React from 'react';
import { Header } from '@/components/Header';
import { styled } from '@/styles';
import { Table, TableCell, TableHead, TableRow, TableBody } from '../ui/table';
import { useConfirm } from '@/providers/confirm-provider';
const StyledTableContainer = styled.div(() => {
  return {
    height: 'calc(100vh - 60px)',
    padding: '78px 72px',
    overflowY: 'auto',
  };
});
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
                  <TableCell>...</TableCell>
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
