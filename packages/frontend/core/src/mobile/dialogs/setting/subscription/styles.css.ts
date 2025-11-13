import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const root = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 16,
  border: `1px solid ${cssVarV2('database/border')}`,
  borderRadius: '12px',
  padding: '10px 16px',
  backgroundColor: cssVarV2('edgeless/selection/selectionMarqueeBackground'),
});

export const content = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

export const title = style({
  fontSize: '17px',
  lineHeight: '22px',
  fontWeight: 600,
  color: cssVarV2('text/primary'),
});

export const description = style({
  fontSize: '13px',
  lineHeight: '18px',
  fontWeight: 400,
  color: cssVarV2('text/secondary'),
});

export const button = style({
  fontSize: '15px',
});
