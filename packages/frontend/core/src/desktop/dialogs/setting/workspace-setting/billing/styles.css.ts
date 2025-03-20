import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const paymentMethod = style({
  marginTop: '24px',
});

export const history = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '24px',
});
export const historyContent = style({
  width: '100%',
});

export const noInvoice = style({
  color: cssVarV2('text/secondary'),
  fontSize: cssVar('fontXs'),
});

export const subscriptionSettingSkeleton = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
});

export const billingHistorySkeleton = style({
  display: 'flex',
  flexDirection: 'column',
  minHeight: '72px',
  alignItems: 'center',
  justifyContent: 'center',
});

export const planCard = style({
  display: 'flex',
  justifyContent: 'space-between',
  padding: '12px',
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: '8px',
});

export const currentPlan = style({
  flex: '1 0 0',
});

export const planPrice = style({
  fontSize: cssVar('fontH6'),
  fontWeight: 600,
});

export const billingFrequency = style({
  fontSize: cssVar('fontBase'),
});

export const currentPlanName = style({
  fontSize: cssVar('fontXs'),
  fontWeight: 500,
  color: cssVarV2('text/emphasis'),
  cursor: 'pointer',
});

export const cancelPlanButton = style({
  marginTop: '8px',
});

export const cardNameLabelRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
});

export const cardName = style({
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
  color: cssVarV2('text/primary'),
  lineHeight: '22px',
});

export const cardLabelContainer = style({
  display: 'flex',
  gap: '4px',
  color: cssVarV2('button/primary'),
  selectors: {
    '&.past-due': {
      color: cssVarV2('button/error'),
    },
  },
});

export const cardLabel = style({
  fontSize: cssVar('fontXs'),
  fontWeight: 500,
});

export const cardLabelIcon = style({
  width: '14px',
  height: '14px',
});
