import { globalStyle, style } from '@vanilla-extract/css';

export const subscription = style({});

export const history = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '24px',
});
export const historyContent = style({
  width: '100%',
});

export const planCard = style({
  display: 'flex',
  justifyContent: 'space-between',
  padding: '12px',
  border: '1px solid var(--affine-border-color)',
  borderRadius: '8px',
});

export const currentPlan = style({
  flex: '1 0 0',
});

export const planAction = style({
  marginTop: '8px',
});

export const planPrice = style({
  fontSize: 'var(--affine-font-h-6)',
  fontWeight: 600,
});

export const billingFrequency = style({
  fontSize: 'var(--affine-font-base)',
});

export const paymentMethod = style({
  marginTop: '24px',
});

globalStyle('.dangerous-setting .name', {
  color: 'var(--affine-error-color)',
});

export const noInvoice = style({
  color: 'var(--affine-text-secondary-color)',
  fontSize: 'var(--affine-font-xs)',
});

export const currentPlanName = style({
  fontSize: 'var(--affine-font-xs)',
  fontWeight: 500,
  color: 'var(--affine-text-emphasis-color)',
  cursor: 'pointer',
});
export const button = style({
  padding: '4px 12px',
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
