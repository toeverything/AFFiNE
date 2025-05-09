import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const paymentMethod = style({
  marginTop: '24px',
});

export const planCard = style({
  display: 'flex',
  flexDirection: 'column',
  padding: '12px',
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  backgroundColor: cssVarV2('layer/white'),
  borderRadius: '8px',
});

export const container = style({
  display: 'flex',
  justifyContent: 'space-between',
});

export const currentPlan = style({
  flex: '1 0 0',
});

export const planPrice = style({
  fontSize: cssVar('fontH6'),
  fontWeight: 600,
  display: 'flex',
  gap: '4px',
  margin: '0px 4px',
  justifyContent: 'center',
  height: '100%',
  alignItems: 'center',
  selectors: {
    '&.hidden': {
      visibility: 'hidden',
    },
  },
});

export const buttonContainer = style({
  display: 'flex',
  justifyContent: 'flex-end',
  marginTop: '12px',
  selectors: {
    '&.left': {
      justifyContent: 'flex-start',
    },
  },
});
export const activeButton = style({
  marginTop: '8px',
});

export const seat = style({
  fontSize: cssVar('fontXs'),
  fontWeight: 400,
});

export const activateModalContent = style({
  padding: '0',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  marginTop: '12px',
  marginBottom: '20px',
});

export const tips = style({
  color: cssVarV2('text/secondary'),
  fontSize: cssVar('fontSm'),
});
