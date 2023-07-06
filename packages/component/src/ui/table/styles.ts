import { styled, textEllipsis } from '../../styles';
import type { TableCellProps } from './interface';

export const StyledTable = styled('table')<{ showBorder?: boolean }>(({
  showBorder,
}) => {
  return {
    fontSize: 'var(--affine-font-base)',
    color: 'var(--affine-text-primary-color)',
    tableLayout: 'fixed',
    width: '100%',
    borderCollapse: 'collapse',
    borderSpacing: '0',

    ...(typeof showBorder === 'boolean'
      ? {
          thead: {
            '::after': {
              display: 'block',
              position: 'absolute',
              content: '""',
              width: '100%',
              height: '1px',
              left: 0,
              background: 'var(--affine-border-color)',
              transition: 'opacity .15s',
              opacity: showBorder ? 1 : 0,
            },
          },
        }
      : {}),
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
>(({
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
});

export const StyledTableHead = styled('thead')(() => {
  return {
    fontWeight: 500,
    color: 'var(--affine-text-secondary-color)',
  };
});

export const StyledTHeadRow = styled('tr')(() => {
  return {
    td: {
      whiteSpace: 'nowrap',
      // How to set tbody height with overflow scroll
      // see https://stackoverflow.com/questions/23989463/how-to-set-tbody-height-with-overflow-scroll
      position: 'sticky',
      top: 0,
      background: 'var(--affine-background-primary-color)',
    },
  };
});

export const StyledTBodyRow = styled('tr')(() => {
  return {
    td: {
      transition: 'background .15s',
    },
    // Add border radius to table row
    // see https://stackoverflow.com/questions/4094126/how-to-add-border-radius-on-table-row
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
