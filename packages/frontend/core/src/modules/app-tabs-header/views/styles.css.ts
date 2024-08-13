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

export const headerLeft = style({
  display: 'flex',
  flexFlow: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingRight: 12,
  gap: 10,
  flexShrink: 0,
  selectors: {
    [`${root}[data-mode="app"] &`]: {
      transition: 'all 0.3s',
    },
  },
});

export const tabs = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  paddingLeft: 8,
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
  marginRight: 8,
});

export const splitViewSeparator = style({
  background: cssVar('borderColor'),
  width: 1,
  height: '100%',
  flexShrink: 0,
});

export const tabWrapper = style({
  display: 'flex',
  alignItems: 'center',
  height: '100%',
  overflow: 'clip',
  position: 'relative',
  padding: '0 6px',
  margin: '0 -6px',
});

export const tab = style({
  height: 32,
  minWidth: 32,
  maxWidth: 200,
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
    [`${tabWrapper} &`]: {
      marginRight: 8,
    },
    '&[data-active="true"]': {
      background: cssVar('backgroundPrimaryColor'),
      boxShadow: cssVar('shadow1'),
    },
    '&[data-padding-right="true"]': {
      paddingRight: 20,
    },
    '&[data-pinned="true"]': {
      flexShrink: 0,
    },
    [`${tabWrapper}[data-dragging="true"] &`]: {
      boxShadow: `0 0 0 1px ${cssVar('primaryColor')}`,
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
  width: 24,
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
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  marginLeft: -8,
  position: 'relative',
  selectors: {
    '&[data-dragged-over=true]:after': {
      content: '""',
      position: 'absolute',
      top: 10,
      height: 32,
      left: -5,
      right: 0,
      width: 2,
      borderRadius: 2,
      background: cssVar('primaryColor'),
    },
  },
});

export const dropIndicator = style({
  position: 'absolute',
  height: 32,
  top: 10,
  width: 2,
  borderRadius: 2,
  opacity: 0,
  background: cssVar('primaryColor'),
  selectors: {
    '&[data-edge="left"]': {
      opacity: 1,
      transform: 'translateX(-5px)',
    },
    '&[data-edge="right"]': {
      right: 0,
      opacity: 1,
      transform: 'translateX(-9px)',
    },
  },
});
