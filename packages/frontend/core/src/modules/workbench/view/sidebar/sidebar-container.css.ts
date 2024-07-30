import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const sidebarContainerInner = style({
  display: 'flex',
  background: cssVar('backgroundPrimaryColor'),
  flexDirection: 'column',
  overflow: 'hidden',
  height: '100%',
  width: '100%',
  borderRadius: 'inherit',
  selectors: {
    ['[data-client-border=true][data-is-floating="true"] &']: {
      boxShadow: cssVar('shadow3'),
      border: `1px solid ${cssVar('borderColor')}`,
    },
  },
});

export const sidebarBodyTarget = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  alignItems: 'center',
});

export const borderTop = style({
  borderTop: `0.5px solid ${cssVar('borderColor')}`,
});

export const sidebarBodyNoSelection = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  justifyContent: 'center',
  userSelect: 'none',
  color: cssVar('--affine-text-secondary-color'),
  alignItems: 'center',
});
