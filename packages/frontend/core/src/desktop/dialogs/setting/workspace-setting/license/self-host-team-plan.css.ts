import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const pricingPlan = style({
  display: 'flex',
  flexDirection: 'column',
  padding: '12px',
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  backgroundColor: cssVarV2('layer/white'),
  borderRadius: '8px',
  gap: '18px',
  marginBottom: '24px',
});

export const planCardHeader = style({
  display: 'flex',
  padding: '0px 6px',
  gap: '4px',
  flexDirection: 'column',
  fontSize: cssVar('fontBase'),
});

export const planCardTitle = style({
  fontWeight: 600,
  lineHeight: '24px',
});

export const planCardSubtitle = style({
  color: cssVarV2('text/secondary'),
  fontWeight: 400,
  lineHeight: '24px',
});

export const benefitItems = style({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '12px',
  gridAutoRows: 'min-content',
  '@media': {
    'screen and (max-width: 768px)': {
      gridTemplateColumns: '1fr',
    },
  },
});

export const benefitItem = style({
  display: 'flex',
  gap: '8px',
  fontSize: cssVar('fontXs'),
});

export const doneIconStyle = style({
  color: cssVarV2('button/primary'),
  width: '20px',
  height: '20px',
});

export const leanMoreButtonContainer = style({
  display: 'flex',
  justifyContent: 'flex-end',
});
