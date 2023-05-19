import { Content, Table, TableBody, TableCell } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';

import type { ListData } from './all-page';
import { FavoriteTag } from './components/favorite-tag';
import { TitleCell } from './components/title-cell';
import { OperationCell } from './operation-cell';
import {
  StyledTableContainer,
  StyledTableRow,
  StyledTitleLink,
  StyledTitleWrapper,
} from './styles';

export const AllPageListMobileView = ({
  isPublicWorkspace,
  list,
}: {
  isPublicWorkspace: boolean;
  list: ListData[];
}) => {
  const t = useAFFiNEI18N();

  const ListItems = list.map(
    ({
      pageId,
      title,
      icon,
      isPublicPage,
      favorite,
      onClickPage,
      bookmarkPage,
      onOpenPageInNewTab,
      removeToTrash,
      onDisablePublicSharing,
    }) => {
      return (
        <StyledTableRow key={pageId}>
          <TitleCell
            icon={icon}
            text={title || t['Untitled']()}
            data-testid="title"
            onClick={onClickPage}
            proportion={0.8}
          />

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
    <Table>
      <TableBody>{ListItems}</TableBody>
    </Table>
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
