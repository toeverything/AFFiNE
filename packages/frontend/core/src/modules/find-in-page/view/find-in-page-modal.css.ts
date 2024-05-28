import { cssVar } from '@toeverything/theme';
import { createVar, style } from '@vanilla-extract/css';

export const panelWidthVar = createVar('panel-width');

export const container = style({
  vars: {
    [panelWidthVar]: '0px',
  },
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 12px 8px 8px',
  position: 'fixed',
  right: '28px',
  top: '80px',
  transform: `translateX(calc(${panelWidthVar} * -1))`,
});

export const leftContent = style({
  display: 'flex',
  alignItems: 'center',
  flex: 1,
});

export const inputContainer = style({
  display: 'flex',
  alignSelf: 'stretch',
  alignItems: 'center',
  gap: '8px',
  flex: 1,
  height: '32px',
  position: 'relative',
  margin: '0 8px',
});

export const input = style({
  position: 'absolute',
  padding: '0',
  inset: 0,
  height: '100%',
  width: '100%',
  color: 'transparent',
  background: cssVar('white10'),
});

export const inputHack = style([
  input,
  {
    '::placeholder': {
      color: cssVar('iconColor'),
    },
    pointerEvents: 'none',
  },
]);

export const count = style({
  color: cssVar('textSecondaryColor'),
  fontSize: cssVar('fontXs'),
  userSelect: 'none',
});

export const arrowButton = style({
  padding: '4px',
  fontSize: '24px',
  width: '32px',
  height: '32px',
  flexShrink: 0,
  border: '1px solid',
  borderColor: cssVar('borderColor'),
  alignItems: 'baseline',
  background: 'transparent',
  selectors: {
    '&.backward': {
      marginLeft: '8px',
      borderRadius: '4px 0 0 4px',
    },
    '&.forward': {
      borderLeft: 'none',
      borderRadius: '0 4px 4px 0',
    },
  },
});
