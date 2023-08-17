import { style } from '@vanilla-extract/css';

export const linkItemRoot = style({
  color: 'inherit',
  display: 'contents',
});

export const root = style({
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: '4px',
  textAlign: 'left',
  color: 'inherit',
  width: '100%',
  minHeight: '30px',
  userSelect: 'none',
  cursor: 'pointer',
  padding: '0 12px',
  fontSize: 'var(--affine-font-sm)',
  marginTop: '4px',
  selectors: {
    '&:hover': {
      background: 'var(--affine-hover-color)',
    },
    '&[data-active="true"]': {
      background: 'var(--affine-hover-color)',
    },
    '&[data-disabled="true"]': {
      cursor: 'default',
      color: 'var(--affine-text-secondary-color)',
      pointerEvents: 'none',
    },
    // this is not visible in dark mode
    // '&[data-active="true"]:hover': {
    //   background:
    //     // make this a variable?
    //     'linear-gradient(0deg, rgba(0, 0, 0, 0.04), rgba(0, 0, 0, 0.04)), rgba(0, 0, 0, 0.04)',
    // },
    '&[data-collapsible="true"]': {
      paddingLeft: '4px',
      paddingRight: '4px',
    },
    '&[data-type="collection-list-item"][data-collapsible="false"][data-active="true"],&[data-type="favorite-list-item"][data-collapsible="false"][data-active="true"], &[data-type="favorite-list-item"][data-collapsible="false"]:hover, &[data-type="collection-list-item"][data-collapsible="false"]:hover':
      {
        width: 'calc(100% + 8px)',
        transform: 'translateX(-8px)',
        paddingLeft: '20px',
        paddingRight: '12px',
      },
    [`${linkItemRoot}:first-of-type &`]: {
      marginTop: '0px',
    },
  },
});

export const content = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
});

export const postfix = style({
  justifySelf: 'flex-end',
  display: 'none',
  selectors: {
    [`${root}:hover &`]: {
      display: 'flex',
    },
  },
});

export const icon = style({
  color: 'var(--affine-icon-color)',
  fontSize: '20px',
});

export const collapsedIconContainer = style({
  width: '16px',
  height: '16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '2px',
  transition: 'transform 0.2s',
  color: 'inherit',
  selectors: {
    '&[data-collapsed="true"]': {
      transform: 'rotate(-90deg)',
    },
    '&[data-disabled="true"]': {
      opacity: 0.3,
      pointerEvents: 'none',
    },
    '&:hover': {
      background: 'var(--affine-hover-color)',
    },
  },
});

export const iconsContainer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  width: '28px',
  flexShrink: 0,
  selectors: {
    '&[data-collapsible="true"]': {
      width: '44px',
    },
  },
});

export const collapsedIcon = style({
  transition: 'transform 0.2s ease-in-out',
  selectors: {
    '&[data-collapsed="true"]': {
      transform: 'rotate(-90deg)',
    },
  },
});

export const spacer = style({
  flex: 1,
});
