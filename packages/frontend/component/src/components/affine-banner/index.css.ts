import { style } from '@vanilla-extract/css';

export const browserWarningStyle = style({
  backgroundColor: 'var(--affine-background-warning-color)',
  color: 'var(--affine-warning-color)',
  height: '36px',
  fontSize: 'var(--affine-font-sm)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  position: 'relative',
});
export const closeButtonStyle = style({
  width: '36px',
  height: '36px',
  color: 'var(--affine-icon-color)',
  cursor: 'pointer',
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
  position: 'absolute',
  right: '16px',
});
export const closeIconStyle = style({
  width: '15px',
  height: '15px',
  position: 'relative',
  zIndex: 1,
});
export const downloadTipContainer = style({
  backgroundColor: 'var(--affine-background-error-color)',
  color: 'var(--affine-error-color)',
  width: '100%',
  fontSize: 'var(--affine-font-sm)',
  fontWeight: '700',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 16px',
  position: 'sticky',
  gap: '16px',
  containerType: 'inline-size',
});

export const downloadMessage = style({
  color: 'var(--affine-error-color)',
  flexGrow: 1,
  flexShrink: 1,
});

export const downloadRightItem = style({
  display: 'flex',
  flexShrink: 0,
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '16px',
});
