import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const content = style({
  // to avoid content clipped
  width: `calc(100% + 20px)`,
  padding: '10px 10px 20px 10px',
  marginLeft: '-10px',
});

export const section = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '12px 0px',
});
export const label = style({
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
  lineHeight: '22px',
  color: cssVarV2.text.primary,
});
const baseFormInput = style({
  fontSize: 15,
  fontWeight: 500,
  lineHeight: '24px',
  color: cssVarV2.text.primary,
  border: `1px solid ${cssVarV2.layer.insideBorder.blackBorder}`,
});
export const input = style([
  baseFormInput,
  {
    borderRadius: 4,
    padding: '8px 10px',
  },
]);
export const select = style([
  baseFormInput,
  {
    borderRadius: 8,
    padding: '10px',
  },
]);
