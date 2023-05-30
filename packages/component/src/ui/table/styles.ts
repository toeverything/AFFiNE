import { styled, textEllipsis } from '../../styles';
import type { TableCellProps } from './interface';

export const StyledTable = styled('table')(() => {
  return {
    fontSize: 'var(--affine-font-base)',
    color: 'var(--affine-text-primary-color)',
    tableLayout: 'fixed',
    width: '100%',
    borderCollapse: 'separate',
    borderSpacing: '0',
  };
});

export const StyledTableBody = styled('tbody')(() => {
  return {
    fontWeight: 400,
  };
});

export const StyledTableCell = styled('td')<
  Pick<
    TableCellProps,
    'ellipsis' | 'align' | 'proportion' | 'active' | 'onClick'
  >
>(
  ({
    align = 'left',
    ellipsis = false,
    proportion,
    active = false,
    onClick,
  }) => {
    const width = proportion ? `${proportion * 100}%` : 'auto';
    return {
      width,
      height: '52px',
      paddingLeft: '16px',
      boxSizing: 'border-box',
      textAlign: align,
      verticalAlign: 'middle',
      whiteSpace: 'nowrap',
      userSelect: 'none',
      fontSize: 'var(--affine-font-sm)',
      ...(active ? { color: 'var(--affine-text-primary-color)' } : {}),
      ...(ellipsis ? textEllipsis(1) : {}),
      ...(onClick ? { cursor: 'pointer' } : {}),
    };
  }
);

export const StyledTableHead = styled('thead')(() => {
  return {
    fontWeight: 500,
    color: 'var(--affine-text-secondary-color)',
    tr: {
      td: {
        whiteSpace: 'nowrap',
      },
      ':hover': {
        td: {
          background: 'unset',
        },
      },
    },
  };
});

export const StyledTableRow = styled('tr')(() => {
  return {
    td: {
      transition: 'background .15s',
    },
    'td:first-of-type': {
      borderTopLeftRadius: '10px',
      borderBottomLeftRadius: '10px',
    },
    'td:last-of-type': {
      borderTopRightRadius: '10px',
      borderBottomRightRadius: '10px',
    },

    ':hover': {
      td: {
        background: 'var(--affine-hover-color)',
      },
    },
  };
});
