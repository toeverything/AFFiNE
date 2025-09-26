import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const docIconPickerTrigger = style({
  width: 64,
  height: 64,
  padding: 2,
  selectors: {
    '&[data-icon-type="emoji"], &[data-icon-type="affine-icon"]': {
      fontSize: 60,
      lineHeight: 1,
    },
  },
});

export const placeholder = style({
  padding: '4px',
});
export const placeholderContent = style({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
});
export const placeholderContentIcon = style({
  color: cssVarV2.icon.secondary,
  fontSize: 16,
});
export const placeholderContentText = style({
  color: cssVarV2.text.secondary,
  fontSize: 12,
});
