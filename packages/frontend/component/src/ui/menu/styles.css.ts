import { cssVar } from '@toeverything/theme';
import { createVar, style } from '@vanilla-extract/css';
export const triggerWidthVar = createVar('triggerWidthVar');
export const menuContent = style({
  minWidth: '180px',
  color: cssVar('textPrimaryColor'),
  borderRadius: '8px',
  padding: '8px',
  fontSize: cssVar('fontSm'),
  fontWeight: '400',
  backgroundColor: cssVar('backgroundOverlayPanelColor'),
  boxShadow: cssVar('menuShadow'),
  userSelect: 'none',
  ['WebkitAppRegion' as string]: 'no-drag',
});
export const menuItem = style({
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
    '&.block': {
      maxWidth: '100%',
    },
    '&[data-disabled]': {
      color: cssVar('textDisableColor'),
      pointerEvents: 'none',
      cursor: 'not-allowed',
    },
    '&[data-highlighted]': {
      backgroundColor: cssVar('hoverColor'),
    },
    '&:hover': {
      backgroundColor: cssVar('hoverColor'),
    },
    '&.danger:hover': {
      color: cssVar('errorColor'),
      backgroundColor: cssVar('backgroundErrorColor'),
    },
    '&.warning:hover': {
      color: cssVar('warningColor'),
      backgroundColor: cssVar('backgroundWarningColor'),
    },
    '&.checked': {
      color: cssVar('primaryColor'),
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
  fontSize: cssVar('fontH5'),
  color: cssVar('iconColor'),
  selectors: {
    '&.start': { marginRight: '4px' },
    '&.end': { marginLeft: '4px' },
    '&.selected, &.checked': {
      color: cssVar('primaryColor'),
    },
    [`${menuItem}.danger:hover &`]: {
      color: cssVar('errorColor'),
    },
    [`${menuItem}.warning:hover &`]: {
      color: cssVar('warningColor'),
    },
  },
});
export const menuSeparator = style({
  height: '1px',
  backgroundColor: cssVar('borderColor'),
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
  color: cssVar('textPrimaryColor'),
  border: '1px solid',
  backgroundColor: cssVar('white'),
  borderRadius: 8,
  display: 'inline-flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: cssVar('fontXs'),
  cursor: 'pointer',
  ['WebkitAppRegion' as string]: 'no-drag',
  borderColor: cssVar('borderColor'),
  outline: 'none',
  selectors: {
    '&:hover': {
      background: cssVar('hoverColor'),
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
      color: cssVar('textDisableColor'),
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
