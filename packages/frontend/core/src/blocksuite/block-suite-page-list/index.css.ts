import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const pageListEmptyStyle = style({
  height: 'calc(100% - 52px)',
});
export const emptyDescButton = style({
  cursor: 'pointer',
  color: cssVar('textSecondaryColor'),
  background: cssVar('backgroundCodeBlock'),
  border: `1px solid ${cssVar('borderColor')}`,
  borderRadius: '4px',
  padding: '0 6px',
  boxSizing: 'border-box',
  selectors: {
    '&:hover': {
      background: cssVar('hoverColor'),
    },
  },
});
export const emptyDescKbd = style([
  emptyDescButton,
  {
    cursor: 'text',
  },
]);
