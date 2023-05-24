import { displayFlex, styled } from '@affine/component';
import { TableRow } from '@affine/component';

export const StyledTableContainer = styled('div')(({ theme }) => {
  return {
    height: 'calc(100vh - 52px)',
    padding: '52px 32px',
    maxWidth: '100%',
    overflowY: 'auto',
    [theme.breakpoints.down('sm')]: {
      padding: '52px 0px',
      'tr > td:first-of-type': {
        borderTopLeftRadius: '0px',
        borderBottomLeftRadius: '0px',
      },
      'tr > td:last-of-type': {
        borderTopRightRadius: '0px',
        borderBottomRightRadius: '0px',
      },
    },
  };
});

/**
 * @deprecated
 */
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
      visibility: 'hidden',
    },
    '&:hover': {
      '.favorite-button': {
        visibility: 'visible',
      },
    },
  };
});
