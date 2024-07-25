import { cssVar } from '@toeverything/theme';
import { globalStyle } from '@vanilla-extract/css';

globalStyle('body', {
  color: cssVar('textPrimaryColor'),
  fontFamily: cssVar('fontFamily'),
  fontSize: cssVar('fontBase'),
});

if (process.env.NODE_ENV === 'development') {
  globalStyle('.undefined', {
    border: '5px solid red !important',
  });
}
