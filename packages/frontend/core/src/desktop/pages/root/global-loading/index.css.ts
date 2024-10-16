import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const globalLoadingWrapperStyle = style({
  position: 'fixed',
  top: 0,
  left: 0,
  bottom: 0,
  right: '100%',
  zIndex: 5,
  backgroundColor: cssVar('backgroundModalColor'),
  opacity: 0,
  transition: 'opacity .3s',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: cssVar('processingColor'),
  '@media': {
    print: {
      display: 'none',
      zIndex: -1,
    },
  },
  selectors: {
    '&[data-loading="true"]': {
      right: 0,
      opacity: 1,
    },
  },
});
