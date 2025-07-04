import { cssVar } from '@toeverything/theme';
import { createVar, style } from '@vanilla-extract/css';

export const dividerSpace = createVar('dividerSpace');

export const divider = style({
  vars: {
    [dividerSpace]: '8px',
  },
  borderBottom: `1px solid ${cssVar('borderColor')}`,
  height: 0,
  margin: `${dividerSpace} 0`,
  width: '100%',
});

export const verticalDivider = style({
  borderLeft: `1px solid ${cssVar('borderColor')}`,
  width: 0,
  height: '100%',
  margin: `0 ${dividerSpace}`,
});

export const thinner = style({
  borderWidth: '0.5px',
});
