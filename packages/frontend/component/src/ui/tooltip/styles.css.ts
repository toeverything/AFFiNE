import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const tooltipContent = style({
  backgroundColor: cssVar('tooltip'),
  color: cssVar('white'),
  padding: '5px 12px',
  fontSize: cssVar('fontSm'),
  lineHeight: '22px',
  borderRadius: '4px',
  maxWidth: '280px',
});
