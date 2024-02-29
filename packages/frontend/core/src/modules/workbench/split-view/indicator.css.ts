import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const indicator = style({
  width: 29,
  height: 14,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  cursor: 'pointer',
  ['WebkitAppRegion' as string]: 'no-drag',
  color: cssVar('placeholderColor'),

  selectors: {
    '&:hover, &:active, &[data-active="true"]': {
      color: cssVar('brandColor'),
    },
  },
});

export const indicatorInner = style({
  width: 15,
  height: 3,
  borderRadius: 10,
  backgroundColor: 'currentColor',
});
