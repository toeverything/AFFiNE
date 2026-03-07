import { style } from '@vanilla-extract/css';

export const sourceModeContainer = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  backgroundColor: 'var(--affine-background-primary-color)',
  fontFamily: 'var(--affine-font-mono)',
  fontSize: '14px',
});

export const sourceModeToolbar = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 16px',
  borderBottom: '1px solid var(--affine-border-color)',
  backgroundColor: 'var(--affine-background-secondary-color)',
  flexShrink: 0,
});

export const sourceModeLabel = style({
  fontWeight: 600,
  fontSize: '12px',
  color: 'var(--affine-text-secondary-color)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  flexShrink: 0,
});

export const sourceModeHint = style({
  fontSize: '12px',
  color: 'var(--affine-text-secondary-color)',
  flex: 1,
});

const buttonBase = style({
  padding: '4px 10px',
  minHeight: 28 /* T080: touch target ≥24px floor per FR-055 */,
  borderRadius: 4,
  fontSize: '12px',
  fontWeight: 500,
  border: 'none',
  cursor: 'pointer',
  flexShrink: 0,
  ':disabled': {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  ':focus-visible': {
    outline: '2px solid var(--affine-primary-color)',
    outlineOffset: 2,
  },
});

export const sourceModeExitButton = style([
  buttonBase,
  {
    backgroundColor: 'var(--affine-primary-color)',
    color: 'var(--affine-white)',
    ':hover': {
      backgroundColor: 'var(--affine-primary-color-hover)',
    },
  },
]);

export const sourceModeCancelButton = style([
  buttonBase,
  {
    backgroundColor: 'transparent',
    color: 'var(--affine-text-primary-color)',
    border: '1px solid var(--affine-border-color)',
    ':hover': {
      backgroundColor: 'var(--affine-background-secondary-color)',
    },
  },
]);

export const sourceModeError = style({
  padding: '8px 16px',
  backgroundColor: 'var(--affine-background-error-color)',
  color: 'var(--affine-error-color)',
  fontSize: '13px',
  borderBottom: '1px solid var(--affine-border-color)',
  flexShrink: 0,
});

export const sourceModeTextarea = style({
  flex: 1,
  resize: 'none',
  border: 'none',
  outline: 'none',
  padding: '16px',
  fontFamily: 'var(--affine-font-mono)',
  fontSize: '14px',
  lineHeight: 1.6,
  color: 'var(--affine-text-primary-color)',
  backgroundColor: 'var(--affine-background-primary-color)',
  ':disabled': {
    opacity: 0.6,
  },
  ':focus-visible': {
    outline: '2px solid var(--affine-primary-color)',
    outlineOffset: -2,
  },
});
