import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const datePickerTriggerInput = style({
  fontSize: cssVar('fontXs'),
  width: '50px',
  fontWeight: '600',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '22px',
  textAlign: 'center',
  ':hover': {
    background: cssVar('hoverColor'),
    borderRadius: '4px',
  },
});
