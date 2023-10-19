import { style } from '@vanilla-extract/css';

export const workspaceItemStyle = style({
  '@media': {
    'screen and (max-width: 720px)': {
      width: '100%',
    },
  },
});
