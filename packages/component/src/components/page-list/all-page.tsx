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
import { FavoritedIcon, FavoriteIcon } from '@blocksuite/icons';
import { useMediaQuery, useTheme } from '@mui/material';
import { forwardRef } from 'react';

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
  listType: 'all' | 'favorite' | 'shared' | 'public';
  onClickPage: (pageId: string, newTab?: boolean) => void;
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
  listType,
}) => {
  const t = useAFFiNEI18N();

  const isShared = listType === 'shared';

  const theme = useTheme();
  const isSmallDevices = useMediaQuery(theme.breakpoints.down('sm'));
  if (isSmallDevices) {
    return <PageListMobileView list={list} />;
  }

  const ListHead = () => {
    const t = useAFFiNEI18N();
    return (
      <TableHead>
        <TableRow>
          <TableCell proportion={0.5}>{t['Title']()}</TableCell>
          <TableCell proportion={0.2}>{t['Created']()}</TableCell>
          <TableCell proportion={0.2}>
            {isShared
              ? // TODO add i18n
                'Shared'
              : t['Updated']()}
          </TableCell>
          <TableCell proportion={0.1}></TableCell>
        </TableRow>
      </TableHead>
    );
  };

  const ListItems = list.map(
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
            suffix={
              <FavoriteTag
                className={favorite ? '' : 'favorite-button'}
                onClick={bookmarkPage}
                active={!!favorite}
              />
            }
            onClick={onClickPage}
          />
          <TableCell ellipsis={true} onClick={onClickPage}>
            {createDate}
          </TableCell>
          <TableCell ellipsis={true} onClick={onClickPage}>
            {updatedDate ?? createDate}
          </TableCell>
          {!isPublicWorkspace && (
            <TableCell
              style={{ padding: 0 }}
              data-testid={`more-actions-${pageId}`}
            >
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
        <ListHead />
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
  favorite: boolean;
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
