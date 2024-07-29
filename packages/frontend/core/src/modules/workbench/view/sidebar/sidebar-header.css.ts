import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const header = style({
  display: 'flex',
  height: '52px',
  width: '100%',
  alignItems: 'center',
  flexShrink: 0,
  padding: '0 16px',
  zIndex: 1,
  gap: '12px',
  background: cssVar('backgroundPrimaryColor'),
  '@media': {
    print: {
      display: 'none',
    },
  },
});

export const spacer = style({
  flexGrow: 1,
  minWidth: 12,
});

export const standaloneExtensionSwitcherWrapper = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  height: '52px',
  position: 'relative',
});
