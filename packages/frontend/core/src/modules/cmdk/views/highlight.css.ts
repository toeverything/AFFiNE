import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const highlightContainer = style({
  display: 'flex',
  flexWrap: 'nowrap',
});
export const highlightText = style({
  whiteSpace: 'pre',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});
export const highlightKeyword = style({
  display: 'inline-block',
  verticalAlign: 'bottom',
  color: cssVar('primaryColor'),
  whiteSpace: 'pre',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  flexShrink: 0,
  maxWidth: '360px',
});
export const labelTitle = style({
  fontSize: cssVar('fontBase'),
  lineHeight: '24px',
  fontWeight: 400,
  textAlign: 'justify',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});
export const labelContent = style({
  fontSize: cssVar('fontXs'),
  lineHeight: '20px',
  fontWeight: 400,
  textAlign: 'justify',
});
