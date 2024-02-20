import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const blockCard = style({
  display: 'flex',
  gap: '12px',
  padding: '8px 12px',
  color: cssVar('textPrimaryColor'),
  backgroundColor: cssVar('white80'),
  borderRadius: '8px',
  userSelect: 'none',
  cursor: 'pointer',
  textAlign: 'start',
  boxShadow: cssVar('shadow1'),
  selectors: {
    '&:hover': {
      backgroundColor: cssVar('hoverColor'),
    },
    '&[aria-disabled]': {
      color: cssVar('textDisableColor'),
    },
    '&[aria-disabled]:hover': {
      backgroundColor: cssVar('white80'),
      cursor: 'not-allowed',
    },
    // TODO active styles
  },
});
export const blockCardAround = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
});
export const blockCardContent = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
});
export const blockCardDesc = style({
  color: cssVar('textSecondaryColor'),
  fontSize: cssVar('fontXs'),
});
