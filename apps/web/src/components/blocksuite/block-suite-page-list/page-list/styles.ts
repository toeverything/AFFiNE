import { displayFlex, styled } from '@affine/component';
import { TableRow } from '@affine/component';

export const StyledTableContainer = styled('div')(({ theme }) => {
  return {
    height: 'calc(100vh - 52px)',
    padding: '78px 72px',
    overflowY: 'auto',
    [theme.breakpoints.down('sm')]: {
      padding: '12px 24px',
    },
  };
});
export const StyledTitleWrapper = styled('div')(({ theme }) => {
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
export const StyledTitleLink = styled('div')(({ theme }) => {
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
  };
});

export const StyledTableRow = styled(TableRow)(() => {
  return {
    cursor: 'pointer',
    '.favorite-button': {
      display: 'none',
    },
    '&:hover': {
      '.favorite-button': {
        display: 'flex',
      },
    },
  };
});
