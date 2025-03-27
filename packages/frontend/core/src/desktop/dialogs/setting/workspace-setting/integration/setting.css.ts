import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const settingItem = style({
  width: '100%',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 8,
});

export const settingName = style({
  fontSize: 14,
  lineHeight: '22px',
  fontWeight: 500,
  color: cssVarV2.text.primary,
});

export const settingDesc = style({
  fontSize: 12,
  lineHeight: '20px',
  fontWeight: 400,
  color: cssVarV2.text.secondary,
});

export const textRadioGroup = style({
  borderRadius: 4,
  border: `1px solid ${cssVarV2.layer.insideBorder.border}`,
});
export const textRadioGroupItem = style({
  padding: '8px 16px',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 8,
  cursor: 'pointer',
  borderBottom: `1px solid ${cssVarV2.layer.insideBorder.border}`,
  selectors: {
    '&:last-child': {
      borderBottom: 'none',
    },
  },
});
export const textRadioGroupItemName = style({
  fontSize: 14,
  lineHeight: '22px',
  fontWeight: 500,
  color: cssVarV2.text.primary,
});
export const textRadioGroupItemDesc = style({
  fontSize: 12,
  lineHeight: '20px',
  fontWeight: 400,
  color: cssVarV2.text.secondary,
});
export const textRadioGroupItemCheckWrapper = style({
  width: 24,
  height: 24,
  fontSize: 24,
  color: cssVarV2.icon.activated,
  flexShrink: 0,
});
