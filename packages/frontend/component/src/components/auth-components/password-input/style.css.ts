import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const statusWrapper = style({
  marginLeft: 8,
  marginRight: 10,
});
export const tag = style({
  padding: '2px 15px',
  height: 20,
  lineHeight: '20px',
  borderRadius: 10,
  fontSize: cssVar('fontXs'),
  selectors: {
    '&.weak': {
      backgroundColor: cssVar('tagRed'),
      color: cssVar('errorColor'),
    },
    '&.medium': {
      backgroundColor: cssVar('tagOrange'),
      color: cssVar('warningColor'),
    },
    '&.strong': {
      backgroundColor: cssVar('tagGreen'),
      color: cssVar('successColor'),
    },
    '&.minimum, &.maximum': {
      backgroundColor: cssVar('tagRed'),
      color: cssVar('errorColor'),
    },
  },
});
