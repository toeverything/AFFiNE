import type { IconButtonProps, TableCellProps } from '@affine/component';
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
import { OperationCell, TrashOperationCell } from '@affine/component/page-list';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  ArrowDownBigIcon,
  ArrowUpBigIcon,
  FavoritedIcon,
  FavoriteIcon,
} from '@blocksuite/icons';
import { useMediaQuery, useTheme } from '@mui/material';
import type { CSSProperties } from 'react';
import { forwardRef } from 'react';

import { NewPageButton } from './new-page-buttton';
import {
  StyledTableContainer,
  StyledTableRow,
  StyledTitleLink,
  StyledTitleWrapper,
} from './styles';
import { useSorter } from './use-sorter';

// eslint-disable-next-line react/display-name
const FavoriteTag = forwardRef<
  HTMLButtonElement,
  {
    active: boolean;
  } & Omit<IconButtonProps, 'children'>
>(({ active, onClick, ...props }, ref) => {
  const t = useAFFiNEI18N();
  return (
    <Tooltip
      content={active ? t['Favorited']() : t['Favorite']()}
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
        onClick={e => {
          e.stopPropagation();
          onClick?.(e);
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

export type PageListProps = {
  isPublicWorkspace?: boolean;
  list: ListData[];
  onCreateNewPage: () => void;
  onCreateNewEdgeless: () => void;
};

const TitleCell = ({
  icon,
  text,
  suffix,
  ...props
}: {
  icon: JSX.Element;
  text: string;
  suffix?: JSX.Element;
} & TableCellProps) => {
  return (
    <TableCell {...props}>
      <StyledTitleWrapper>
        <StyledTitleLink>
          {icon}
          <Content ellipsis={true} color="inherit">
            {text}
          </Content>
        </StyledTitleLink>
        {suffix}
      </StyledTitleWrapper>
    </TableCell>
  );
};

const AllPagesHead = ({
  sorter,
  createNewPage,
  createNewEdgeless,
}: {
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
      sortable: false,
      styles: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      } satisfies CSSProperties,
    },
  ];

  return (
    <TableHead>
      <TableRow>
        {titleList.map(
          ({ key, content, proportion, sortable = true, styles }) => (
            <TableCell
              key={key}
              proportion={proportion}
              active={sorter.key === key}
              onClick={
                sortable
                  ? () => sorter.shiftOrder(key as keyof ListData)
                  : undefined
              }
              style={styles}
            >
              {content}
              {sorter.key === key &&
                (sorter.order === 'asc' ? (
                  <ArrowUpBigIcon width={24} height={24} />
                ) : (
                  <ArrowDownBigIcon width={24} height={24} />
                ))}
            </TableCell>
          )
        )}
      </TableRow>
    </TableHead>
  );
};

export type ListData = {
  pageId: string;
  icon: JSX.Element;
  title: string;
  favorite: boolean;
  createDate: string;
  updatedDate?: string;
  trashDate?: string;
  isPublicPage: boolean;
  onClickPage: () => void;
  onOpenPageInNewTab: () => void;
  bookmarkPage: () => void;
  removeToTrash: () => void;
  onDisablePublicSharing: () => void;
};

export const PageList: React.FC<PageListProps> = ({
  isPublicWorkspace = false,
  list,
  onCreateNewPage,
  onCreateNewEdgeless,
}) => {
  const t = useAFFiNEI18N();
  const sorter = useSorter<ListData>({
    data: list,
    key: 'createDate',
    order: 'desc',
  });

  const theme = useTheme();
  const isSmallDevices = useMediaQuery(theme.breakpoints.down('sm'));
  if (isSmallDevices) {
    return <PageListMobileView list={sorter.data} />;
  }

  const ListItems = sorter.data.map(
    (
      {
        pageId,
        title,
        icon,
        isPublicPage,
        favorite,
        createDate,
        updatedDate,
        onClickPage,
        bookmarkPage,
        onOpenPageInNewTab,
        removeToTrash,
        onDisablePublicSharing,
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
            data-testid="title"
            onClick={onClickPage}
          />
          <TableCell
            data-testid="created-date"
            ellipsis={true}
            onClick={onClickPage}
          >
            {createDate}
          </TableCell>
          <TableCell
            data-testid="updated-date"
            ellipsis={true}
            onClick={onClickPage}
          >
            {updatedDate ?? createDate}
          </TableCell>
          {!isPublicWorkspace && (
            <TableCell
              style={{
                padding: 0,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '10px',
              }}
              data-testid={`more-actions-${pageId}`}
            >
              <FavoriteTag
                className={favorite ? '' : 'favorite-button'}
                onClick={bookmarkPage}
                active={!!favorite}
              />
              <OperationCell
                title={title}
                favorite={favorite}
                isPublic={isPublicPage}
                onOpenPageInNewTab={onOpenPageInNewTab}
                onToggleFavoritePage={bookmarkPage}
                onRemoveToTrash={removeToTrash}
                onDisablePublicSharing={onDisablePublicSharing}
              />
            </TableCell>
          )}
        </StyledTableRow>
      );
    }
  );

  return (
    <StyledTableContainer>
      <Table>
        <AllPagesHead
          sorter={sorter}
          createNewPage={onCreateNewPage}
          createNewEdgeless={onCreateNewEdgeless}
        />
        <TableBody>{ListItems}</TableBody>
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

export type TrashListData = {
  pageId: string;
  icon: JSX.Element;
  title: string;
  createDate: string;
  updatedDate?: string;
  trashDate?: string;
  // isPublic: boolean;
  onClickPage: () => void;
  onRestorePage: () => void;
  onPermanentlyDeletePage: () => void;
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
    return <PageListMobileView list={mobileList} />;
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
            {createDate}
          </TableCell>
          <TableCell ellipsis={true} onClick={onClickPage}>
            {trashDate}
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

const PageListMobileView: React.FC<{
  list: {
    pageId: string;
    title: string;
    icon: JSX.Element;
    onClickPage: () => void;
  }[];
}> = ({ list }) => {
  const t = useAFFiNEI18N();

  const ListItems = list.map(({ pageId, title, icon, onClickPage }, index) => {
    return (
      <StyledTableRow
        data-testid={`page-list-item-${pageId}`}
        key={`${pageId}-${index}`}
      >
        <TableCell onClick={onClickPage}>
          <StyledTitleWrapper>
            <StyledTitleLink>
              {icon}
              <Content ellipsis={true} color="inherit">
                {title || t['Untitled']()}
              </Content>
            </StyledTitleLink>
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
