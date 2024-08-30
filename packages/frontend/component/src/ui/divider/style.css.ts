import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const divider = style({
  borderBottom: `1px solid ${cssVar('borderColor')}`,
  height: 0,
  margin: '8px 0',
  width: '100%',
});

export const verticalDivider = style({
  borderLeft: `1px solid ${cssVar('borderColor')}`,
  width: 0,
  height: '100%',
  margin: '0 2px',
});

export const thinner = style({
  borderWidth: '0.5px',
});
