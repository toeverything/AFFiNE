import { style } from '@vanilla-extract/css';

export const detailContentStyle = style({
  backgroundColor: 'rgba(0, 0, 0, 0.04)',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'auto',
  padding: '10px',
  borderLeft: '1px solid var(--affine-border-color)',
  borderTop: '1px solid var(--affine-border-color)',
});

export const detailContentActionsStyle = style({
  marginTop: 'auto',
  marginBottom: '10px',
  fontSize: 'var(--affine-font-xs)',
  display: 'flex',
  width: '100%',
  justifyContent: 'space-between',
});
export const textareaStyle = style({
  fontSize: 'var(--affine-font-xs)',
  border: '1px solid var(--affine-border-color)',
  width: '100%',
  borderRadius: '4px',
  background: 'var(--affine-hover-color)',
  height: '117px',
  padding: '8px 10px',
  '::placeholder': {
    color: 'var(--affine-text-secondary-color)',
  },
});
export const sendButtonStyle = style({
  fontSize: 'var(--affine-font-xs)',
  width: '16px',
  height: '16px',
  marginLeft: '8px',
  ':hover': {
    cursor: 'pointer',
    backgroundColor: 'transparent',
  },
});
