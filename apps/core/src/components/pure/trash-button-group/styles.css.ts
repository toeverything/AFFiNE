import { style } from '@vanilla-extract/css';

export const group = style({
  display: 'flex',
  gap: '24px',
  justifyContent: 'center',
});
export const buttonContainer = style({
  boxShadow: 'var(--affine-float-button-shadow-2)',
  borderRadius: '8px',
});
export const deleteHintContainer = style({
  position: 'fixed',
  zIndex: 2,
  padding: '14px 24px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  bottom: '0',
  backgroundColor: 'var(--affine-background-primary-color)',
  borderTop: '1px solid var(--affine-border-color)',
  selectors: {
    '&[data-has-background="false"]': {
      backgroundColor: 'transparent',
      borderTop: 'none',
    },
  },
});
export const deleteHintText = style({
  fontSize: '15px',
  fontWeight: '500',
  lineHeight: '24px',
  color: 'var(--affine-text-secondary-color)',
});
