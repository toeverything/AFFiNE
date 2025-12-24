import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const userPlanButton = style({
  display: 'flex',
  fontSize: '10px',
  height: 16,
  fontWeight: 400,
  cursor: 'pointer',
  color: cssVarV2('button/pureWhiteText'),
  backgroundColor: cssVarV2('badge/free'),
  padding: '0 4px',
  borderRadius: 2,
  justifyContent: 'center',
  alignItems: 'center',

  selectors: {
    '&[data-is-believer="true"]': {
      backgroundColor: cssVarV2('badge/believer'),
    },
    '&[data-is-pro="true"]': {
      backgroundColor: cssVarV2('badge/pro'),
    },
  },
});
