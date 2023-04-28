import { displayFlex, styled } from '@affine/component';
import { TableRow } from '@affine/component';

export const StyledTableContainer = styled('div')(({ theme }) => {
  return {
    height: 'calc(100vh - 52px)',
    padding: '78px 72px',
    maxWidth: '100%',
    overflowY: 'auto',
    [theme.breakpoints.down('md')]: {
      padding: '12px 24px',
    },
  };
});
export const StyledTitleWrapper = styled('div')(() => {
  return {
    ...displayFlex('flex-start', 'center'),
    a: {
      color: 'inherit',
    },
    'a:visited': {
      color: 'unset',
    },
    'a:hover': {
      color: 'var(--affine-primary-color)',
    },
  };
});
export const StyledTitleLink = styled('div')(() => {
  return {
    maxWidth: '80%',
    marginRight: '18px',
    ...displayFlex('flex-start', 'center'),
    color: 'var(--affine-text-primary-color)',
    '>svg': {
      fontSize: '24px',
      marginRight: '12px',
      color: 'var(--affine-icon-color)',
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
