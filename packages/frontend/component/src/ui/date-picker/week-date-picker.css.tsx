import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const weekDatePicker = style({
  display: 'flex',
  alignItems: 'center',
  gap: 4,

  height: '100%',
  maxHeight: '39px',
});

export const weekDatePickerContent = style({
  width: 0,
  flex: 1,
  display: 'flex',
  alignItems: 'stretch',
  justifyContent: 'space-between',
  gap: 4,
  userSelect: 'none',
});

export const dayCell = style({
  position: 'relative',
  width: 0,
  flexGrow: 1,
  minWidth: 30,
  maxWidth: 130,

  cursor: 'pointer',

  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',

  padding: '2px 4px 1px 4px',
  borderRadius: 4,

  fontFamily: cssVar('fontFamily'),
  fontWeight: 500,
  fontSize: 12,

  selectors: {
    '&:hover': {
      backgroundColor: cssVar('hoverColor'),
    },
    '&[data-today="true"]:not([data-active="true"])': {
      vars: {
        '--cell-color': cssVar('brandColor'),
      },
    },
    '&[data-active="true"]': {
      vars: {
        '--cell-color': cssVar('pureWhite'),
      },
      background: cssVar('brandColor'),
    },

    // interactive
    '&::before, &::after': {
      content: '',
      position: 'absolute',
      inset: 0,
      zIndex: 1,
      pointerEvents: 'none',
      borderRadius: 'inherit',
      opacity: 0,
    },
    '&::before': {
      boxShadow: '0 0 0 2px var(--affine-brand-color)',
    },
    '&::after': {
      border: '1px solid var(--affine-brand-color)',
    },
    '&:focus-visible::before': {
      opacity: 0.5,
    },
    '&:focus-visible::after': {
      opacity: 1,
    },
  },
});
export const dayCellWeek = style({
  width: '100%',
  height: 16,
  lineHeight: '16px',
  textAlign: 'center',

  textOverflow: 'clip',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  color: 'var(--cell-color, var(--affine-text-secondary-color))',
});
export const dayCellDate = style({
  width: '100%',
  height: 20,
  lineHeight: '20px',
  textAlign: 'center',

  color: 'var(--cell-color, var(--affine-text-primary-color))',
});
