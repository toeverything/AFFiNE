import { globalStyle, style } from '@vanilla-extract/css';

export const containerStyle = style({
  display: 'flex',
  width: '100%',
  padding: '0 16px',
  gap: '10px',
});
export const conversationStyle = style({
  padding: '10px 18px',
  border: '1px solid var(--affine-border-color)',
  fontSize: 'var(--affine-font-xs)',
  lineHeight: '16px',
  borderRadius: '18px',
  position: 'relative',
});
export const conversationContainerStyle = style({
  maxWidth: '90%',
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
});
export const insertButtonsStyle = style({
  width: '100%',
  marginTop: '10px',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
});
export const insertButtonStyle = style({
  maxWidth: '100%',
  padding: '16px 8px',
  fontSize: 'var(--affine-font-xs)',
  borderRadius: '8px',
  border: '1px solid var(--affine-border-color)',
  cursor: 'pointer',
  backgroundColor: 'var(--affine-white)',
  gap: '8px',
  ':hover': {
    background: 'var(--affine-white),var(--affine-hover-color)',
    borderColor: 'var(--affine-border-color)',
  },
});
export const avatarRightStyle = style({
  flexDirection: 'row-reverse',
});
export const aiMessageStyle = style({
  backgroundColor: 'rgba(207, 252, 255, 0.3)',
});

export const humanMessageStyle = style({
  backgroundColor: 'var(--affine-white-90)',
});
export const regenerateButtonStyle = style({
  position: 'absolute',
  display: 'none',
  right: '12px',
  top: '-16px',
  padding: '4px 8px',
  fontSize: 'var(--affine-font-xs)',
  borderRadius: '8px',
  border: '1px solid var(--affine-border-color)',
  cursor: 'pointer',
  backgroundColor: 'var(--affine-white)',
  ':hover': {
    background:
      'linear-gradient(var(--affine-white),var(--affine-white)),var(--affine-hover-color)',
    backgroundBlendMode: 'overlay',
    display: 'flex',
  },
});
export const resetIconStyle = style({
  fontSize: 'var(--affine-font-sm)',
  display: 'inline-flex',
  alignItems: 'center',
  marginRight: '4px',
});
globalStyle(`${conversationStyle}:hover ${regenerateButtonStyle}`, {
  display: 'flex',
});
