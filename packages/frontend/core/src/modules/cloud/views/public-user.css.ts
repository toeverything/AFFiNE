import { style } from '@vanilla-extract/css';

export const publicUserLabel = style({
  fontSize: 'inherit',
  display: 'inline-flex',
  alignItems: 'baseline',
});

export const publicUserLabelLoading = style([
  publicUserLabel,
  {
    opacity: 0.5,
  },
]);

export const publicUserLabelRemoved = style([
  publicUserLabel,
  {
    opacity: 0.5,
    textDecoration: 'line-through',
  },
]);

export const publicUserLabelAvatar = style({
  marginRight: '0.5em',
  transform: 'translateY(4px)',
});
