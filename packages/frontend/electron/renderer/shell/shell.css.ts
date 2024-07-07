import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const root = style({
  width: '100vw',
  height: '100vh',
  display: 'flex',
  flexDirection: 'row',
  borderBottom: `1px solid ${cssVar('borderColor')}`,
  ['WebkitAppRegion' as string]: 'drag',
});

export const tabs = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '8px',
  padding: '8px',
  flex: 1,
});

export const pinSeparator = style({
  background: cssVar('borderColor'),
  width: 1,
  height: 16,
  flexShrink: 0,
});

export const splitViewSeparator = style({
  background: cssVar('borderColor'),
  width: 1,
  height: '100%',
  flexShrink: 0,
});

export const tab = style({
  height: 32,
  minWidth: 32,
  background: cssVar('backgroundSecondaryColor'),
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  color: cssVar('textSecondaryColor'),
  userSelect: 'none',
  borderRadius: 4,
  transition: 'background 0.1s, box-shadow 0.1s',
  selectors: {
    '&[data-active="true"]': {
      background: cssVar('backgroundPrimaryColor'),
      boxShadow: cssVar('shadow1'),
    },
  },
});

export const splitViewLabel = style({
  padding: '0 8px',
  height: '100%',
  display: 'flex',
  gap: '4px',
  fontWeight: 500,
  alignItems: 'center',
  maxWidth: 180,
  cursor: 'default',
});

export const splitViewLabelText = style({
  transition: 'color 0.2s',
  textOverflow: 'ellipsis',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  color: cssVar('textSecondaryColor'),
  fontSize: cssVar('fontXs'),
  selectors: {
    [`${splitViewLabel}:hover &`]: {
      color: cssVar('textPrimaryColor'),
    },
    [`${splitViewLabel}[data-active="true"] &`]: {
      color: cssVar('primaryColor'),
    },
  },
});

export const tabIcon = style({
  color: cssVar('iconSecondary'),
  transition: 'all 0.2s',
});

export const labelIcon = style([
  tabIcon,
  {
    width: 16,
    height: 16,
    fontSize: 16,
    flexShrink: 0,
    selectors: {
      [`${splitViewLabel}[data-active=true] &`]: {
        color: cssVar('primaryColor'),
      },
    },
  },
]);

export const controlIconButton = style([
  tabIcon,
  {
    margin: '0',
    overflow: 'hidden',
    width: '0 !important',
    selectors: {
      [`${tab}[data-active=true] &`]: {
        width: '20px !important',
        margin: '0 4px',
      },
    },
  },
]);

export const divider = style({
  flex: 1,
});
