import { style } from '@vanilla-extract/css';

import { globalVars } from '../../styles/variables.css';

export const page = style({
  width: '100dvw',
  height: '100dvh',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  boxSizing: 'border-box',
  selectors: {
    '&[data-tab="true"]': {
      paddingBottom: globalVars.appTabSafeArea,
    },
  },
});
