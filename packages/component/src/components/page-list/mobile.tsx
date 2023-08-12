import { useAFFiNEI18N } from '@affine/i18n/hooks';

import {
  Content,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeadRow,
} from '../../..';
import { AllPagesBody } from './all-pages-body';
import { NewPageButton } from './components/new-page-buttton';
import {
  StyledTableBodyRow,
  StyledTableContainer,
  StyledTitleLink,
} from './styles';
import type { ListData } from './type';
import { useVirtualTableHeight } from './use-virtual-table-height';
import { VirtualTable } from './virtual-table';

const MobileHead = ({
  isPublicWorkspace,
  createNewPage,
  createNewEdgeless,
  importFile,
}: {
  isPublicWorkspace: boolean;
  createNewPage: () => void;
  createNewEdgeless: () => void;
  importFile: () => void;
}) => {
  const t = useAFFiNEI18N();
  return (
    <TableHead>
      <TableHeadRow>
        <TableCell proportion={0.8}>{t['Title']()}</TableCell>
        {!isPublicWorkspace && (
          <TableCell>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
              }}
            >
              <NewPageButton
                createNewPage={createNewPage}
                createNewEdgeless={createNewEdgeless}
                importFile={importFile}
              />
            </div>
          </TableCell>
        )}
      </TableHeadRow>
    </TableHead>
  );
};

export const AllPageListMobileView = ({
  list,
  isPublicWorkspace,
  createNewPage,
  createNewEdgeless,
  importFile,
}: {
  isPublicWorkspace: boolean;
  list: ListData[];
  createNewPage: () => void;
  createNewEdgeless: () => void;
  importFile: () => void;
}) => {
  const virtualTableHeight = useVirtualTableHeight(
    '.main-container',
    '.header-container'
  );

  return (
    <StyledTableContainer>
      <Table>
        <MobileHead
          isPublicWorkspace={isPublicWorkspace}
          createNewPage={createNewPage}
          createNewEdgeless={createNewEdgeless}
          importFile={importFile}
        />
      </Table>
      <VirtualTable
        width={'100%'}
        height={virtualTableHeight}
        itemSize={() => 52}
        itemCount={list.length}
        itemData={{ isPublicWorkspace, data: list, groupKey: 'updatedDate' }}
      >
        {AllPagesBody}
      </VirtualTable>
    </StyledTableContainer>
  );
};

// TODO align to {@link AllPageListMobileView}
export const TrashListMobileView = ({
  list,
}: {
  list: {
    pageId: string;
    title: string;
    icon: JSX.Element;
    onClickPage: () => void;
  }[];
}) => {
  const t = useAFFiNEI18N();

  const ListItems = list.map(({ pageId, title, icon, onClickPage }, index) => {
    return (
      <StyledTableBodyRow
        data-testid={`page-list-item-${pageId}`}
        key={`${pageId}-${index}`}
      >
        <TableCell onClick={onClickPage}>
          <StyledTitleLink>
            {icon}
            <Content ellipsis={true} color="inherit">
              {title || t['Untitled']()}
            </Content>
          </StyledTitleLink>
        </TableCell>
      </StyledTableBodyRow>
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
