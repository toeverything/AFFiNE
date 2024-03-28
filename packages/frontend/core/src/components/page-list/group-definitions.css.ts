import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const groupLabelWrapper = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
});

export const tagIcon = style({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  marginLeft: '4px',
  marginRight: '6px',
});

export const groupLabel = style({
  fontSize: cssVar('fontSm'),
  lineHeight: '1.5em',
  color: cssVar('textPrimaryColor'),
});

export const pageCount = style({
  fontSize: cssVar('fontBase'),
  lineHeight: '1.6em',
  color: cssVar('textSecondaryColor'),
  marginRight: '12px',
});

export const favouritedIcon = style({
  color: cssVar('primaryColor'),
  marginRight: '6px',
  fontSize: '16px',
});

export const notFavouritedIcon = style({
  color: cssVar('iconColor'),
  marginRight: '6px',
  fontSize: '16px',
});
