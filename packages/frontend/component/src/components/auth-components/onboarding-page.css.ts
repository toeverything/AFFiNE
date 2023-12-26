import { globalStyle, style } from '@vanilla-extract/css';

export const scrollableContainer = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  height: '100vh',
  padding: '0 200px',
  backgroundColor: 'var(--affine-background-primary-color)',
  '@media': {
    'screen and (max-width: 1024px)': {
      padding: '80px 36px',
      alignItems: 'center',
    },
  },
});

export const onboardingContainer = style({
  maxWidth: '600px',
  padding: '160px 0',
  '@media': {
    'screen and (max-width: 1024px)': {
      padding: '40px 0',
      width: '100%',
    },
  },
});

export const content = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  gap: '36px',
  minHeight: '450px',
});

export const question = style({
  color: 'var(--affine-text-color)',
  fontFamily: 'Inter',
  fontSize: 'var(--affine-font-h-1)',
  fontStyle: 'normal',
  fontWeight: 600,
  lineHeight: '36px',
});

export const optionsWrapper = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '16px',
  // flexShrink: 0,
  flexGrow: 1,
});

export const buttonWrapper = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'flex-start',
  gap: '24px',
  flexShrink: 0,
});

export const checkBox = style({
  alignItems: 'center',
  fontSize: '24px',
});

globalStyle(`${checkBox} svg`, {
  color: 'var(--affine-brand-color)',
  flexShrink: 0,
  marginRight: '8px',
});

export const label = style({
  fontSize: 'var(--affine-font-base)',
  fontWeight: 500,
});

export const input = style({
  width: '520px',
  '@media': {
    'screen and (max-width: 768px)': {
      width: '100%',
    },
  },
});

export const button = style({
  fontWeight: 600,
  fontSize: 'var(--affine-font-base)',
});

export const openAFFiNEButton = style({
  alignSelf: 'flex-start',
});

export const rightCornerButton = style({
  position: 'absolute',
  top: '24px',
  right: '24px',
});

export const thankContainer = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
});

export const thankTitle = style({
  fontSize: 'var(--affine-font-title)',
  fontWeight: '700',
  lineHeight: '44px',
});

export const thankText = style({
  fontSize: 'var(--affine-font-h-6)',
  height: '300px',
  fontWeight: '600',
  lineHeight: '26px',
});

export const linkGroup = style({
  display: 'flex',
  position: 'absolute',
  bottom: '24px',
  right: '24px',
  fontSize: 'var(--affine-font-xs)',
  height: '16px',
  gap: '6px',
  width: '100%',
  justifyContent: 'flex-end',
  backgroundColor: 'var(--affine-background-color)',
});
export const link = style({
  color: 'var(--affine-text-secondary-color)',
  selectors: {
    '&:visited': {
      color: 'var(--affine-text-secondary-color)',
    },
  },
});
