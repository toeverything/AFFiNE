import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const menu = style({
  background: cssVar('white'),
  width: '250px',
  maxHeight: '30vh',
  overflowY: 'auto',
});

export const menuItem = style({
  color: cssVar('textPrimaryColor'),
  selectors: {
    '&[data-selected=true]': {
      color: cssVar('primaryColor'),
    },
  },
});

export const languageLabelWrapper = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginRight: '8px',
});
