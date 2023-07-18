import { globalStyle, style } from '@vanilla-extract/css';

export const importPageContainerStyle = style({
  position: 'relative',
  display: 'flex',
  width: '480px',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  borderRadius: '12px',
  boxShadow: 'var(--affine-popover-shadow)',
  background: 'var(--affine-background-overlay-panel-color)',
  overflow: 'hidden',
});

export const importPageBodyStyle = style({
  display: 'flex',
  padding: '32px 40px 20px 40px',
  flexDirection: 'column',
  gap: '20px',
  alignSelf: 'stretch',
});

export const importPageButtonContainerStyle = style({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  padding: '0px 40px 36px',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '20px',
  alignSelf: 'stretch',
});

globalStyle(`${importPageBodyStyle} .title`, {
  fontSize: 'var(--affine-font-h-6)',
  fontWeight: 600,
});

globalStyle(`${importPageBodyStyle} a`, {
  whiteSpace: 'nowrap',
  wordBreak: 'break-word',
  color: 'var(--affine-link-color)',
  textDecoration: 'none',
  cursor: 'pointer',
});
