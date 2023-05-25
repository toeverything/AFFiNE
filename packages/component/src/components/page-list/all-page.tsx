import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowDownBigIcon, ArrowUpBigIcon } from '@blocksuite/icons';
import { useMediaQuery, useTheme } from '@mui/material';
import type { CSSProperties } from 'react';

import { AllPagesBody } from './all-pages-body';
import { NewPageButton } from './components/new-page-buttton';
import { TitleCell } from './components/title-cell';
import { AllPageListMobileView, TrashListMobileView } from './mobile';
import { TrashOperationCell } from './operation-cell';
import { StyledTableContainer, StyledTableRow } from './styles';
import type { ListData, PageListProps, TrashListData } from './type';
import { useSorter } from './use-sorter';
import { formatDate } from './utils';

const AllPagesHead = ({
  isPublicWorkspace,
  sorter,
  createNewPage,
  createNewEdgeless,
}: {
  isPublicWorkspace: boolean;
  sorter: ReturnType<typeof useSorter<ListData>>;
  createNewPage: () => void;
  createNewEdgeless: () => void;
}) => {
  const t = useAFFiNEI18N();
  const titleList = [
    {
      key: 'title',
      content: t['Title'](),
      proportion: 0.5,
    },
    {
      key: 'createDate',
      content: t['Created'](),
      proportion: 0.2,
    },
    {
      key: 'updatedDate',
      content: t['Updated'](),
      proportion: 0.2,
    },

    {
      key: 'unsortable_action',
      content: (
        <NewPageButton
          createNewPage={createNewPage}
          createNewEdgeless={createNewEdgeless}
        />
      ),
      showWhen: () => !isPublicWorkspace,
      sortable: false,
      styles: {
        justifyContent: 'flex-end',
      } satisfies CSSProperties,
    },
  ];

  return (
    <TableHead>
      <TableRow>
        {titleList
          .filter(({ showWhen = () => true }) => showWhen())
          .map(({ key, content, proportion, sortable = true, styles }) => (
            <TableCell
              key={key}
              proportion={proportion}
              active={sorter.key === key}
              onClick={
                sortable
                  ? () => sorter.shiftOrder(key as keyof ListData)
                  : undefined
              }
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  ...styles,
                }}
              >
                {content}
                {sorter.key === key &&
                  (sorter.order === 'asc' ? (
                    <ArrowUpBigIcon width={24} height={24} />
                  ) : (
                    <ArrowDownBigIcon width={24} height={24} />
                  ))}
              </div>
            </TableCell>
          ))}
      </TableRow>
    </TableHead>
  );
};

export const PageList = ({
  isPublicWorkspace = false,
  list,
  onCreateNewPage,
  onCreateNewEdgeless,
}: PageListProps) => {
  const sorter = useSorter<ListData>({
    data: list,
    key: 'updatedDate',
    order: 'desc',
  });

  const theme = useTheme();
  const isSmallDevices = useMediaQuery(theme.breakpoints.down('sm'));
  if (isSmallDevices) {
    return (
      <AllPageListMobileView
        isPublicWorkspace={isPublicWorkspace}
        createNewPage={onCreateNewPage}
        createNewEdgeless={onCreateNewEdgeless}
        list={sorter.data}
      />
    );
  }

  return (
    <StyledTableContainer>
      <Table>
        <AllPagesHead
          isPublicWorkspace={isPublicWorkspace}
          sorter={sorter}
          createNewPage={onCreateNewPage}
          createNewEdgeless={onCreateNewEdgeless}
        />
        <AllPagesBody
          isPublicWorkspace={isPublicWorkspace}
          data={sorter.data}
        />
      </Table>
    </StyledTableContainer>
  );
};

const TrashListHead = () => {
  const t = useAFFiNEI18N();
  return (
    <TableHead>
      <TableRow>
        <TableCell proportion={0.5}>{t['Title']()}</TableCell>
        <TableCell proportion={0.2}>{t['Created']()}</TableCell>
        <TableCell proportion={0.2}>{t['Moved to Trash']()}</TableCell>
        <TableCell proportion={0.1}></TableCell>
      </TableRow>
    </TableHead>
  );
};

export const PageListTrashView: React.FC<{
  list: TrashListData[];
}> = ({ list }) => {
  const t = useAFFiNEI18N();

  const theme = useTheme();
  const isSmallDevices = useMediaQuery(theme.breakpoints.down('sm'));
  if (isSmallDevices) {
    const mobileList = list.map(({ pageId, icon, title, onClickPage }) => ({
      title,
      icon,
      pageId,
      onClickPage,
    }));
    return <TrashListMobileView list={mobileList} />;
  }
  const ListItems = list.map(
    (
      {
        pageId,
        title,
        icon,
        createDate,
        trashDate,
        onClickPage,
        onPermanentlyDeletePage,
        onRestorePage,
      },
      index
    ) => {
      return (
        <StyledTableRow
          data-testid={`page-list-item-${pageId}`}
          key={`${pageId}-${index}`}
        >
          <TitleCell
            icon={icon}
            text={title || t['Untitled']()}
            onClick={onClickPage}
          />
          <TableCell ellipsis={true} onClick={onClickPage}>
            {formatDate(createDate)}
          </TableCell>
          <TableCell ellipsis={true} onClick={onClickPage}>
            {trashDate ? formatDate(trashDate) : '--'}
          </TableCell>
          <TableCell
            style={{ padding: 0 }}
            data-testid={`more-actions-${pageId}`}
          >
            <TrashOperationCell
              onPermanentlyDeletePage={onPermanentlyDeletePage}
              onRestorePage={onRestorePage}
              onOpenPage={onClickPage}
            />
          </TableCell>
        </StyledTableRow>
      );
    }
  );

  return (
    <StyledTableContainer>
      <Table>
        <TrashListHead />
        <TableBody>{ListItems}</TableBody>
      </Table>
    </StyledTableContainer>
  );
};
