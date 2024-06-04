import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';

export const table = style({
  borderCollapse: 'collapse',
  width: '100%',
  borderSpacing: 0,
  tableLayout: 'fixed',
});

globalStyle(`${table} th, ${table} td`, {
  padding: '8px',
  border: `1px solid ${cssVar('borderColor')}`,
});

globalStyle(`${table} th`, {
  backgroundColor: cssVar('primaryColor'),
  color: cssVar('white'),
  textAlign: 'left',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

globalStyle(`${table} th:first-child`, {
  borderTopLeftRadius: '4px',
  borderTopRightRadius: '4px',
});

globalStyle(`${table} td`, {
  backgroundColor: cssVar('white'),
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

globalStyle(`${table} tr:nth-child(even) td`, {
  backgroundColor: cssVar('buttonGrayColor'),
});
