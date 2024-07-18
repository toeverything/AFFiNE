import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const notifyHeader = style({
  fontWeight: 500,
  fontSize: 15,
});

export const notifyFooter = style({
  display: 'flex',
  justifyContent: 'end',
  gap: 12,
  paddingTop: 8,
});

export const actionButton = style({
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  lineHeight: '22px',
});
export const confirmButton = style({
  selectors: {
    '&.plain': {
      color: cssVar('brandColor'),
    },
  },
});

export const cancelButton = style({
  selectors: {
    '&.plain': {
      color: cssVar('textPrimaryColor'),
    },
  },
});
