import { CollectionBar } from '@affine/component/page-list';
import { DEFAULT_SORT_KEY } from '@affine/env/constant';
import type { PropertiesMeta } from '@affine/env/filter';
import type { GetPageInfoById } from '@affine/env/page-info';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowDownBigIcon, ArrowUpBigIcon } from '@blocksuite/icons';
import { useMediaQuery, useTheme } from '@mui/material';
import type React from 'react';
import { type CSSProperties, useMemo } from 'react';

import {
  ScrollableContainer,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeadRow,
} from '../..';
import { TableBodyRow } from '../../ui/table';
import { useHasScrollTop } from '../app-sidebar/sidebar-containers/use-has-scroll-top';
import { AllPagesBody } from './all-pages-body';
import { NewPageButton } from './components/new-page-buttton';
import { TitleCell } from './components/title-cell';
import { AllPageListMobileView, TrashListMobileView } from './mobile';
import { TrashOperationCell } from './operation-cell';
import { StyledTableContainer } from './styles';
import type { ListData, PageListProps, TrashListData } from './type';
import { useSorter } from './use-sorter';
import { formatDate, useIsSmallDevices } from './utils';

const AllPagesHead = ({
  isPublicWorkspace,
  sorter,
  createNewPage,
  createNewEdgeless,
  importFile,
  getPageInfo,
  propertiesMeta,
}: {
  isPublicWorkspace: boolean;
  sorter: ReturnType<typeof useSorter<ListData>>;
  createNewPage: () => void;
  createNewEdgeless: () => void;
  importFile: () => void;
  getPageInfo: GetPageInfoById;
  propertiesMeta: PropertiesMeta;
}) => {
  const t = useAFFiNEI18N();
  const titleList = useMemo(
    () => [
      {
        key: 'title',
        content: t['Title'](),
        proportion: 0.5,
      },
      {
        key: 'tags',
        content: t['Tags'](),
        proportion: 0.2,
      },
      {
        key: 'createDate',
        content: t['Created'](),
        proportion: 0.1,
      },
      {
        key: 'updatedDate',
        content: t['Updated'](),
        proportion: 0.1,
      },
      {
        key: 'unsortable_action',
        content: (
          <NewPageButton
            createNewPage={createNewPage}
            createNewEdgeless={createNewEdgeless}
            importFile={importFile}
          />
        ),
        showWhen: () => !isPublicWorkspace,
        sortable: false,
        tableCellStyle: {
          minWidth: '130px',
        } satisfies CSSProperties,
        styles: {
          justifyContent: 'flex-end',
        } satisfies CSSProperties,
      },
    ],
    [createNewEdgeless, createNewPage, importFile, isPublicWorkspace, t]
  );
  const tableItem = useMemo(
    () =>
      titleList
        .filter(({ showWhen = () => true }) => showWhen())
        .map(
          ({
            key,
            content,
            proportion,
            sortable = true,
            styles,
            tableCellStyle,
          }) => (
            <TableCell
              key={key}
              proportion={proportion}
              active={sorter.key === key}
              style={tableCellStyle}
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
          )
        ),
    [sorter, titleList]
  );
  return (
    <TableHead>
      <TableHeadRow>{tableItem}</TableHeadRow>
      <CollectionBar
        columnsCount={titleList.length}
        getPageInfo={getPageInfo}
        propertiesMeta={propertiesMeta}
      />
    </TableHead>
  );
};

export const PageList = ({
  isPublicWorkspace = false,
  list,
  onCreateNewPage,
  onCreateNewEdgeless,
  onImportFile,
  fallback,
  getPageInfo,
  propertiesMeta,
}: PageListProps) => {
  const sorter = useSorter<ListData>({
    data: list,
    key: DEFAULT_SORT_KEY,
    order: 'desc',
  });
  const [hasScrollTop, ref] = useHasScrollTop();
  const isSmallDevices = useIsSmallDevices();
  if (isSmallDevices) {
    return (
      <ScrollableContainer inTableView>
        <AllPageListMobileView
          isPublicWorkspace={isPublicWorkspace}
          createNewPage={onCreateNewPage}
          createNewEdgeless={onCreateNewEdgeless}
          importFile={onImportFile}
          list={sorter.data}
        />
      </ScrollableContainer>
    );
  }

  const groupKey =
    sorter.key === 'createDate' || sorter.key === 'updatedDate'
      ? sorter.key
      : // default sort
      !sorter.key
      ? DEFAULT_SORT_KEY
      : undefined;

  return sorter.data.length === 0 && fallback ? (
    <StyledTableContainer>{fallback}</StyledTableContainer>
  ) : (
    <ScrollableContainer inTableView>
      <StyledTableContainer ref={ref}>
        <Table showBorder={hasScrollTop} style={{ maxHeight: '100%' }}>
          <AllPagesHead
            propertiesMeta={propertiesMeta}
            isPublicWorkspace={isPublicWorkspace}
            sorter={sorter}
            createNewPage={onCreateNewPage}
            createNewEdgeless={onCreateNewEdgeless}
            importFile={onImportFile}
            getPageInfo={getPageInfo}
          />
          <AllPagesBody
            isPublicWorkspace={isPublicWorkspace}
            groupKey={groupKey}
            data={sorter.data}
          />
        </Table>
      </StyledTableContainer>
    </ScrollableContainer>
  );
};

const TrashListHead = () => {
  const t = useAFFiNEI18N();
  return (
    <TableHead>
      <TableHeadRow>
        <TableCell proportion={0.5}>{t['Title']()}</TableCell>
        <TableCell proportion={0.2}>{t['Created']()}</TableCell>
        <TableCell proportion={0.2}>{t['Moved to Trash']()}</TableCell>
        <TableCell proportion={0.1}></TableCell>
      </TableHeadRow>
    </TableHead>
  );
};

export const PageListTrashView: React.FC<{
  list: TrashListData[];
  fallback?: React.ReactNode;
}> = ({ list, fallback }) => {
  const t = useAFFiNEI18N();

  const theme = useTheme();
  const [hasScrollTop, ref] = useHasScrollTop();
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
        preview,
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
        <TableBodyRow
          data-testid={`page-list-item-${pageId}`}
          key={`${pageId}-${index}`}
        >
          <TitleCell
            icon={icon}
            text={title || t['Untitled']()}
            desc={preview}
            onClick={onClickPage}
          />
          <TableCell onClick={onClickPage}>{formatDate(createDate)}</TableCell>
          <TableCell onClick={onClickPage}>
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
        </TableBodyRow>
      );
    }
  );

  return list.length === 0 && fallback ? (
    <StyledTableContainer>{fallback}</StyledTableContainer>
  ) : (
    <ScrollableContainer inTableView>
      <StyledTableContainer ref={ref}>
        <Table showBorder={hasScrollTop}>
          <TrashListHead />
          <TableBody>{ListItems}</TableBody>
        </Table>
      </StyledTableContainer>
    </ScrollableContainer>
  );
};
