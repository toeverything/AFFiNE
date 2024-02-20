import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';
export const moveToTrashStyle = style({
  padding: '4px 12px',
  ':hover': {
    backgroundColor: cssVar('backgroundErrorColor'),
    color: cssVar('errorColor'),
  },
});
globalStyle(`${moveToTrashStyle}:hover svg`, {
  color: cssVar('errorColor'),
});
export const transitionStyle = style({
  transition: 'all 0.3s',
});
