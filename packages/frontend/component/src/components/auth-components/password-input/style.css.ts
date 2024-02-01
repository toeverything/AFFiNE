import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const tag = style({
  padding: '0 15px',
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
    '&.maximum': {
      backgroundColor: cssVar('tagRed'),
      color: cssVar('errorColor'),
    },
  },
});
