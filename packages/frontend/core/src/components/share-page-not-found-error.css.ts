import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const iconWrapper = style({
  position: 'absolute',
  top: '16px',
  left: '16px',
  fontSize: '24px',
  cursor: 'pointer',
  color: cssVar('textPrimaryColor'),
  selectors: {
    '&:visited': {
      color: cssVar('textPrimaryColor'),
    },
  },
});
