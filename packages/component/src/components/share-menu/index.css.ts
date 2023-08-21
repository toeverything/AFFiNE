import { style } from '@vanilla-extract/css';

export const menuItemStyle = style({
  padding: '4px 18px',
  paddingBottom: '16px',
  width: '100%',
});

export const descriptionStyle = style({
  wordWrap: 'break-word',
  // wordBreak: 'break-all',
  fontSize: 'var(--affine-font-xs)',
  lineHeight: '20px',
  color: 'var(--affine-text-secondary-color)',
});

export const buttonStyle = style({
  marginTop: '18px',
  // todo: new color scheme should be used
});

export const actionsStyle = style({
  display: 'flex',
  gap: '9px',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'flex-start',
});

export const containerStyle = style({
  display: 'flex',
  width: '100%',
  flexDirection: 'column',
  gap: '8px',
});
export const indicatorContainerStyle = style({
  position: 'relative',
});
export const inputButtonRowStyle = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  marginTop: '16px',
});
export const titleContainerStyle = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: 'var(--affine-font-sm)',
  fontWeight: 600,
  lineHeight: '22px',
  padding: '0 4px',
});
export const rowContainerStyle = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  padding: '0 4px',
  width: '100%',
  gap: '12px',
});
