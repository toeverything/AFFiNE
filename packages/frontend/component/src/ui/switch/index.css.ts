import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const labelStyle = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  cursor: 'pointer',
});
export const inputStyle = style({
  opacity: 0,
  position: 'absolute',
});
export const switchStyle = style({
  position: 'relative',
  width: '46px',
  height: '26px',
  background: cssVar('toggleDisableBackgroundColor'),
  borderRadius: '37px',
  transition: '200ms all',
  selectors: {
    '&:before': {
      transition: 'all .2s cubic-bezier(0.27, 0.2, 0.25, 1.51)',
      content: '""',
      position: 'absolute',
      width: '20px',
      height: '20px',
      borderRadius: '50%',
      top: '50%',
      background: cssVar('toggleCircleBackgroundColor'),
      transform: 'translate(3px, -50%)',
    },
  },
});
export const switchCheckedStyle = style({
  background: cssVar('primaryColor'),
  selectors: {
    '&:before': {
      borderColor: cssVar('pureBlack10'),
      transform: 'translate(23px,-50%)',
    },
  },
});
export const switchDisabledStyle = style({
  cursor: 'not-allowed',
  opacity: 0.5,
});
