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
  alignItems: 'flex-end',
  marginBottom: '10px',
  fontSize: 'var(--affine-font-xs)',
});
export const inputStyle = style({
  fontSize: 'var(--affine-font-xs)',
});
export const sendButtonStyle = style({
  marginTop: '10px',
  borderRadius: '8px',
  fontSize: 'var(--affine-font-xs)',
});
