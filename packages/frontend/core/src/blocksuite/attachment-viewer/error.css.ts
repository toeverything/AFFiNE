import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export { viewer } from './viewer.css';

export const error = style({
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '4px',
});

export const errorTitle = style({
  fontSize: '15px',
  fontWeight: 500,
  lineHeight: '24px',
  color: cssVarV2('text/primary'),
  marginTop: '12px',
});

export const errorMessage = style({
  fontSize: '12px',
  fontWeight: 500,
  lineHeight: '20px',
  color: cssVarV2('text/tertiary'),
});

export const errorBtns = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  marginTop: '28px',
});
