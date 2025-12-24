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
  selectors: {
    '&[data-show-name="true"]': {
      marginRight: '0.5em',
    },
  },
});
