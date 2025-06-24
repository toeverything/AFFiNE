import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const menuHeader = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '8px',
  fontSize: cssVar('fontXs'),
  fontWeight: 500,
  color: cssVarV2('text/secondary'),
  padding: '8px 16px',
  minWidth: 200,
  textTransform: 'uppercase',
});

export const propertyItem = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  minWidth: 200,
});
