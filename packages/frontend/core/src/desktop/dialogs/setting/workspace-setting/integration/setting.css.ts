import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 24,
  selectors: {
    '&[data-divider="true"]': {
      paddingBottom: 16,
      borderBottom: '0.5px solid ' + cssVarV2.layer.insideBorder.border,
    },
  },
});
export const headerContent = style({
  width: 0,
  flex: 1,
});
export const headerIcon = style({
  width: 40,
  height: 40,
  fontSize: 30,
  borderRadius: 5,
});
export const headerTitle = style({
  fontSize: 15,
  lineHeight: '24px',
  fontWeight: 500,
  color: cssVarV2.text.primary,
});
export const headerCaption = style({
  fontSize: 12,
  lineHeight: '20px',
  fontWeight: 400,
  color: cssVarV2.text.secondary,
});

export const settingItem = style({
  width: '100%',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 8,
  selectors: {
    '&[data-has-desc="false"]': {
      padding: '5px 0',
    },
  },
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
  marginTop: 2,
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
