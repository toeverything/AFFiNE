import { displayFlex, styled, textEllipsis } from '@/styles';
import { TableRow } from '@/ui/table';
import Link from 'next/link';

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
export const StyledTitleLink = styled(Link)(({ theme }) => {
  return {
    maxWidth: '80%',
    marginRight: '18px',
    ...displayFlex('flex-start', 'center'),
    color: theme.colors.textColor,
    '>svg': {
      fontSize: '24px',
      marginRight: '12px',
      color: theme.colors.iconColor,
    },
    ':hover': {
      color: theme.colors.textColor,
      '>svg': {
        color: theme.colors.primaryColor,
      },
    },
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
