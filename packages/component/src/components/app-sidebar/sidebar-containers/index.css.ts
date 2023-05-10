import { style } from '@vanilla-extract/css';

const baseContainer = style({
  padding: '0 8px',
  display: 'flex',
  flexFlow: 'column nowrap',
  rowGap: '8px',
});

export const topContainer = style([baseContainer, {}]);

export const scrollableContainer = style([baseContainer, {}]);
