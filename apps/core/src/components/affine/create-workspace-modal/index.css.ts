import { globalStyle, style } from '@vanilla-extract/css';

export const header = style({
  position: 'relative',
  height: '44px',
});

export const content = style({
  padding: '0 40px',
  fontSize: '18px',
  lineHeight: '26px',
});

globalStyle(`${content} p`, {
  marginTop: '12px',
  marginBottom: '16px',
});

export const contentTitle = style({
  fontSize: '20px',
  lineHeight: '28px',
  fontWeight: 600,
  paddingBottom: '16px',
});

export const buttonGroup = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '20px',
  margin: '24px 0',
});

export const radioGroup = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});

export const radio = style({
  cursor: 'pointer',
  appearance: 'auto',
  marginRight: '12px',
});
