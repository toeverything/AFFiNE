import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const propertyRowNamePopupRow = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '8px',
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  color: cssVarV2('text/secondary'),
  padding: '8px 0px',
  minWidth: 260,
});

export const mobilePropertyRowNamePopupRow = style([
  propertyRowNamePopupRow,
  {
    padding: '8px 20px',
  },
]);

export const propertyRowTypeItem = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  fontSize: cssVar('fontSm'),
  padding: '8px 4px',
  minWidth: 260,
});

export const mobilePropertyRowTypeItem = style([
  propertyRowTypeItem,
  {
    padding: '8px 20px',
  },
]);

export const propertyTypeName = style({
  color: cssVarV2('text/secondary'),
  fontSize: cssVar('fontSm'),
  display: 'flex',
  alignItems: 'center',
  gap: 4,
});

export const propertyName = style({
  color: cssVarV2('text/primary'),
  fontSize: cssVar('fontSm'),
  padding: '0 8px',
  display: 'flex',
  alignItems: 'center',
});

export const mobileRootWrapper = style({
  padding: '10px 16px',
});
