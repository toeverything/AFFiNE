import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const highlightText = style({
  whiteSpace: 'nowrap',
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
