import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { createVar, style } from '@vanilla-extract/css';

export const iconColor = createVar('iconColor');
export const labelColor = createVar('labelColor');
export const borderColor = createVar('borderColor');
export const border = createVar('border');
export const bgColor = createVar('bgColor');

export const menuContent = style({
  minWidth: '180px',
  borderRadius: '8px',
  padding: '4px',
  fontSize: cssVar('fontSm'),
  fontWeight: '400',
  backgroundColor: cssVarV2('layer/background/overlayPanel'),
  boxShadow: cssVar('menuShadow'),
  userSelect: 'none',
  ['WebkitAppRegion' as string]: 'no-drag',
  display: 'flex',
  flexDirection: 'column',
  selectors: {
    '&.mobile': {
      padding: 0,
      boxShadow: 'none',
    },
  },
});

export const menuItem = style({
  vars: {
    [iconColor]: cssVarV2('icon/primary'),
    [labelColor]: cssVarV2('text/primary'),
    [bgColor]: 'transparent',
  },
  color: labelColor,
  backgroundColor: bgColor,
  border: '1px solid transparent',

  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '4px 6px',
  borderRadius: 4,
  lineHeight: '22px',
  outline: 'none',
  cursor: 'pointer',
  boxSizing: 'border-box',
  selectors: {
    '&.block': {
      maxWidth: '100%',
      padding: 0,
      borderRadius: 8,
    },
    '&[data-disabled], &.disabled': {
      vars: {
        [iconColor]: cssVarV2('icon/disable'),
        [labelColor]: cssVarV2('text/secondary'),
      },
      pointerEvents: 'none',
      cursor: 'default',
    },
    '&:hover': {
      backgroundColor: '#959CA51A',
      border: '1px solid #959CA566',
      boxSizing: 'border-box',
      outline: 'none !important',
    },
    '&:focus-visible': {
      outline: '1px solid ' + cssVarV2('layer/insideBorder/primaryBorder'),
    },
    '&.danger:hover': {
      vars: {
        [iconColor]: cssVar('errorColor'),
        [labelColor]: cssVar('errorColor'),
        [bgColor]: cssVar('backgroundErrorColor'),
      },
    },
    '&.warning:hover': {
      vars: {
        [iconColor]: cssVar('warningColor'),
        [labelColor]: cssVar('warningColor'),
        [bgColor]: cssVar('backgroundWarningColor'),
      },
    },
    '&.checked, &.selected': {
      vars: {
        [iconColor]: cssVar('primaryColor'),
      },
    },
    '&[data-state="open"]': {
      backgroundColor: '#959CA533',
      border: '1px solid #959CA566',
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
  color: iconColor,
  width: 20,
  height: 20,
});

export const menuSeparator = style({
  width: '100%',
  height: '8px',
  position: 'relative',
  ':after': {
    content: '""',
    display: 'block',
    height: '1px',
    width: '100%',
    backgroundColor: cssVarV2('layer/insideBorder/border'),
    position: 'absolute',
    top: '50%',
    left: 0,
    transform: 'translateY(-50%) scaleY(0.5)',
  },
});
