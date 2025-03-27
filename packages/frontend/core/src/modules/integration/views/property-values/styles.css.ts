import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const value = style({
  fontSize: 14,
  fontWeight: 400,
  lineHeight: '22px',
  color: cssVarV2.text.primary,
});

export const linkWrapper = style({
  flex: 1,
});
export const sourceValue = style([
  value,
  {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
]);
export const sourceValueIcon = style({
  fontSize: 18,
  width: 22,
  height: 22,
  borderRadius: 3,
  boxShadow: `0px 0px 0px 1px ${cssVarV2.layer.insideBorder.border}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: cssVarV2.integrations.background.iconSolid,
});
export const sourceValueLinkIcon = style({
  fontSize: 18,
  color: cssVarV2.icon.primary,
});
