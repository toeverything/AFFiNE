import { fallbackVar, style } from '@vanilla-extract/css';

import { globalVars } from '../../styles/variables.css';

export const root = style({
  padding: '40px',
  justifyContent: 'flex-end',
  minHeight: `calc(100dvh - ${fallbackVar(globalVars.appKeyboardHeight, '0px')})`,
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
  zIndex: 0,
});

export const content = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: 24,
});
