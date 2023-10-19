import { style } from '@vanilla-extract/css';

export const group = style({
  display: 'flex',
  gap: '16px',
  justifyContent: 'center',
});
export const deleteHintContainer = style({
  position: 'fixed',
  zIndex: 2,
  padding: '14px 20px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  bottom: '0',
  gap: '16px',
  backgroundColor: 'var(--affine-background-primary-color)',
  borderTop: '1px solid var(--affine-border-color)',
  selectors: {
    '&[data-has-background="false"]': {
      backgroundColor: 'transparent',
      borderTop: 'none',
      padding: '14px 0',
    },
  },
});
export const deleteHintText = style({
  fontSize: '15px',
  fontWeight: '500',
  lineHeight: '24px',
  color: 'var(--affine-text-secondary-color)',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  overflow: 'hidden',
  cursor: 'pointer',
});
export const buttonContainer = style({
  color: 'var(--affine-pure-white)',
  padding: '8px 18px',
  fontSize: '20px',
  height: '36px',
});
export const icon = style({
  display: 'flex',
  alignContent: 'center',
});
