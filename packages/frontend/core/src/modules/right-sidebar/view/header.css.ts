import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const header = style({
  display: 'flex',
  height: '52px',
  width: '100%',
  alignItems: 'center',
  flexShrink: 0,
  padding: '0 16px',
  gap: '12px',
  background: cssVar('backgroundPrimaryColor'),
  borderBottom: `1px solid ${cssVar('borderColor')}`,
  selectors: {
    '&[data-sidebar-floating="false"]': {
      ['WebkitAppRegion' as string]: 'drag',
    },
    '&:has([data-popper-placement])': {
      ['WebkitAppRegion' as string]: 'no-drag',
    },
  },
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
