import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const plansWrapper = style({
  display: 'flex',
  gap: '16px',
});
export const planItemCard = style({
  width: '258px',
  height: '426px',
  flexShrink: '0',
  borderRadius: '16px',
  backgroundColor: cssVar('backgroundPrimaryColor'),
  border: `1px solid ${cssVar('borderColor')}`,
  padding: '20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
});
export const planItemHeader = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
});
export const planItemContent = style({
  flexGrow: '1',
  height: 0,
});
