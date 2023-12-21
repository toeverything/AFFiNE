import { createVar, style } from '@vanilla-extract/css';
export const triggerWidthVar = createVar('triggerWidthVar');

export const menuContent = style({
  minWidth: '180px',
  color: 'var(--affine-text-primary-color)',
  borderRadius: '8px',
  padding: '8px',
  fontSize: 'var(--affine-font-sm)',
  fontWeight: '400',
  backgroundColor: 'var(--affine-background-overlay-panel-color)',
  boxShadow: 'var(--affine-menu-shadow)',
  userSelect: 'none',
});

export const menuItem = style({
  maxWidth: '296px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '4px 12px',
  borderRadius: '4px',
  lineHeight: '22px',
  border: 'none',
  outline: 'none',
  cursor: 'pointer',
  boxSizing: 'border-box',
  selectors: {
    '&:not(:last-of-type)': {
      marginBottom: '4px',
    },
    '&.block': { maxWidth: '100%' },
    '&[data-disabled]': {
      color: 'var(--affine-text-disable-color)',
      pointerEvents: 'none',
      cursor: 'not-allowed',
    },
    '&[data-highlighted]': {
      backgroundColor: 'var(--affine-hover-color)',
    },

    '&:hover': {
      backgroundColor: 'var(--affine-hover-color)',
    },
    '&.danger:hover': {
      color: 'var(--affine-error-color)',
      backgroundColor: 'var(--affine-background-error-color)',
    },

    '&.warning:hover': {
      color: 'var(--affine-warning-color)',
      backgroundColor: 'var(--affine-background-warning-color)',
    },

    '&.selected, &.checked': {
      backgroundColor: 'var(--affine-hover-color)',
      color: 'var(--affine-primary-color)',
    },
  },
});

export const menuSpan = style({
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  textAlign: 'left',
});
export const menuItemIcon = style({
  display: 'flex',
  flexShrink: 0,
  fontSize: 'var(--affine-font-h-5)',
  color: 'var(--affine-icon-color)',
  selectors: {
    '&.start': { marginRight: '8px' },
    '&.end': { marginLeft: '8px' },
    '&.selected, &.checked': {
      color: 'var(--affine-primary-color)',
    },

    [`${menuItem}.danger:hover &`]: {
      color: 'var(--affine-error-color)',
    },
    [`${menuItem}.warning:hover &`]: {
      color: 'var(--affine-warning-color)',
    },
  },
});

export const menuSeparator = style({
  height: '1px',
  backgroundColor: 'var(--affine-border-color)',
  marginTop: '12px',
  marginBottom: '8px',
});

export const menuTrigger = style({
  vars: {
    [triggerWidthVar]: 'auto',
  },
  width: triggerWidthVar,
  height: 28,
  lineHeight: '22px',
  padding: '0 10px',
  color: 'var(--affine-text-primary-color)',
  border: '1px solid',
  backgroundColor: 'var(--affine-white)',
  borderRadius: 8,
  display: 'inline-flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: 'var(--affine-font-xs)',
  cursor: 'pointer',
  ['WebkitAppRegion' as string]: 'no-drag',
  borderColor: 'var(--affine-border-color)',
  outline: 'none',

  selectors: {
    '&:hover': {
      background: 'var(--affine-hover-color)',
    },
    '&.no-border': {
      border: 'unset',
    },
    '&.block': {
      display: 'flex',
      width: '100%',
    },
    // size
    '&.large': {
      height: 32,
    },
    '&.extra-large': {
      height: 40,
      fontWeight: 600,
    },
    // color
    '&.disabled': {
      cursor: 'default',
      color: 'var(--affine-disable-color)',
      pointerEvents: 'none',
    },
    // TODO: wait for design
    '&.error': {
      // borderColor: 'var(--affine-error-color)',
    },
    '&.success': {
      // borderColor: 'var(--affine-success-color)',
    },
    '&.warning': {
      // borderColor: 'var(--affine-warning-color)',
    },
    '&.default': {
      // borderColor: 'var(--affine-border-color)',
    },
  },
});
