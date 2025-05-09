import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const container = style({
  width: '100%',
  padding: '8px 16px',
  borderTop: `0.5px solid ${cssVarV2.layer.insideBorder.border}`,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
});

export const trigger = style({
  padding: '2px 4px',
  borderRadius: 4,
  flexShrink: 1,
  minWidth: 0,
});

export const menu = style({
  width: 280,
});

export const deletedText = style({
  textDecoration: 'line-through',
  color: cssVarV2.text.placeholder,
});
export const deletedIcon = style({
  color: cssVarV2.text.placeholder,
});
export const deletedTag = style({
  height: 20,
  borderRadius: 4,
  border: `1px solid ${cssVarV2.button.error}`,
  color: cssVarV2.button.error,
  fontSize: 12,
  lineHeight: '20px',
  padding: '0 8px',
});
