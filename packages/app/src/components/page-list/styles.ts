import { displayFlex, styled, textEllipsis } from '@/styles';
import { TableRow } from '@/ui/table';

export const StyledTableContainer = styled.div(() => {
  return {
    height: 'calc(100vh - 60px)',
    padding: '78px 72px',
    overflowY: 'auto',
  };
});
export const StyledTitleWrapper = styled.div(({ theme }) => {
  return {
    ...displayFlex('flex-start', 'center'),
    a: {
      color: 'inherit',
    },
    'a:visited': {
      color: 'unset',
    },
    'a:hover': {
      color: theme.colors.primaryColor,
    },
  };
});
export const StyledTitleContent = styled.div(({ theme }) => {
  return {
    maxWidth: '90%',
    marginRight: '18px',
    ...textEllipsis(1),
  };
});
export const StyledFavoriteButton = styled.button<{ favorite: boolean }>(
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
export const StyledTableRow = styled(TableRow)(({ theme }) => {
  return {
    '&:hover': {
      '.favorite-button': {
        display: 'flex',
      },
    },
  };
});
