import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const root = style({
  width: '100%',
  height: '52px',
  display: 'flex',
  alignItems: 'center',
  flexDirection: 'row',
  gap: '8px',
  overflow: 'clip',
  pointerEvents: 'auto',
  ['WebkitAppRegion' as string]: 'drag',
  selectors: {
    '&[data-is-windows="false"]': {
      paddingRight: 8,
    },
  },
});

export const tabs = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  padding: '0 8px',
  gap: '8px',
  overflow: 'clip',
  height: '100%',
  selectors: {
    '&[data-pinned="true"]': {
      flexShrink: 0,
    },
  },
});

export const pinSeparator = style({
  background: cssVar('iconSecondary'),
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
  overflow: 'clip',
  background: cssVar('backgroundSecondaryColor'),
  display: 'flex',
  justifyContent: 'flex-start',
  alignItems: 'center',
  color: cssVar('textSecondaryColor'),
  userSelect: 'none',
  borderRadius: 4,
  position: 'relative',
  ['WebkitAppRegion' as string]: 'no-drag',
  selectors: {
    '&[data-active="true"]': {
      background: cssVar('backgroundPrimaryColor'),
      boxShadow: cssVar('shadow1'),
    },
    '&[data-pinned="false"]': {
      paddingRight: 8,
    },
    '&[data-pinned="true"]': {
      flexShrink: 0,
    },
  },
});

export const splitViewLabel = style({
  minWidth: 32,
  padding: '0 8px',
  height: '100%',
  display: 'flex',
  gap: '4px',
  fontWeight: 500,
  alignItems: 'center',
  maxWidth: 180,
  cursor: 'default',
  ':last-of-type': {
    paddingRight: 0,
  },
});

export const splitViewLabelText = style({
  minWidth: 0,
  textOverflow: 'ellipsis',
  overflow: 'clip',
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
    [`${splitViewLabel}:last-of-type &`]: {
      textOverflow: 'clip',
    },
  },
});

export const tabIcon = style({
  color: cssVar('iconSecondary'),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
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
      [`${splitViewLabel}[data-active=false]:hover &`]: {
        color: cssVar('iconColor'),
      },
    },
  },
]);

export const tabCloseButtonWrapper = style({
  pointerEvents: 'none',
  position: 'absolute',
  right: 0,
  top: 0,
  bottom: 0,
  height: '100%',
  width: 16,
  overflow: 'clip',
  display: 'flex',
  alignItems: 'center',
  paddingRight: 4,
  justifyContent: 'flex-end',
  selectors: {
    [`${tab}:is([data-active=true], :hover) &:not(:empty)`]: {
      width: 40,
    },
    [`${tab}[data-active=true] &`]: {
      background: `linear-gradient(270deg, ${cssVar('backgroundPrimaryColor')} 52.86%, rgba(255, 255, 255, 0.00) 100%)`,
    },
    [`${tab}[data-active=false] &`]: {
      background: `linear-gradient(270deg, ${cssVar('backgroundSecondaryColor')} 65.71%, rgba(244, 244, 245, 0.00) 100%)`,
    },
  },
});

export const tabCloseButton = style([
  tabIcon,
  {
    pointerEvents: 'auto',
    width: 16,
    height: '100%',
    display: 'none',
    color: cssVar('iconColor'),
    selectors: {
      [`${tab}:is([data-active=true], :hover) &`]: {
        display: 'flex',
      },
    },
  },
]);

export const spacer = style({
  flexGrow: 1,
});
