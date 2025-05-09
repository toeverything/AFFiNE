import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { createVar, keyframes, style } from '@vanilla-extract/css';

export const animationTimeout = createVar();

const contentShow = keyframes({
  from: {
    opacity: 0,
    transform: 'translateY(-2%) scale(0.96)',
  },
  to: {
    opacity: 1,
    transform: 'translateY(0) scale(1)',
  },
});
const contentHide = keyframes({
  to: {
    opacity: 0,
    transform: 'translateY(-2%) scale(0.96)',
  },
  from: {
    opacity: 1,
    transform: 'translateY(0) scale(1)',
  },
});

export const anchor = style({
  position: 'fixed',
  right: '28px',
  top: '80px',
  zIndex: cssVar('zIndexModal'),
});

export const contentContainer = style({
  width: 400,
  height: 48,
  backgroundColor: cssVar('backgroundOverlayPanelColor'),
  borderRadius: '8px',
  boxShadow: cssVar('shadow3'),
  minHeight: 48,
  outline: 'none',
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  justifyContent: 'space-between',
  border: `0.5px solid ${cssVar('borderColor')}`,
  padding: '8px 12px 8px 8px',
  zIndex: `calc(${cssVar('zIndexModal')} + 1)`,
  willChange: 'transform, opacity',
  selectors: {
    '&[data-state=entered], &[data-state=entering]': {
      animation: `${contentShow} ${animationTimeout} cubic-bezier(0.42, 0, 0.58, 1)`,
      animationFillMode: 'forwards',
    },
    '&[data-state=exited], &[data-state=exiting]': {
      animation: `${contentHide} ${animationTimeout} cubic-bezier(0.42, 0, 0.58, 1)`,
      animationFillMode: 'forwards',
    },
  },
});

export const leftContent = style({
  display: 'flex',
  alignItems: 'center',
  flex: 1,
});

export const searchIcon = style({
  fontSize: '20px',
  color: cssVar('iconColor'),
  verticalAlign: 'middle',
});

export const inputContainer = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flex: 1,
  height: '32px',
  position: 'relative',
  padding: '0 8px',
  borderRadius: '4px',
  background: cssVar('white10'),
  border: `1px solid ${cssVar('borderColor')}`,
  selectors: {
    '&.active': {
      borderColor: cssVar('primaryColor'),
    },
  },
});
export const inputMain = style({
  display: 'flex',
  alignItems: 'center',
  flex: 1,
  height: '32px',
  position: 'relative',
});

export const input = style({
  position: 'absolute',
  padding: '0',
  inset: 0,
  height: '100%',
  width: '100%',
  color: 'transparent',
  fontSize: '15px',
});

export const inputHack = style([
  input,
  {
    '::placeholder': {
      color: cssVar('textPrimaryColor'),
    },
    pointerEvents: 'none',
  },
]);

export const count = style({
  color: cssVar('textSecondaryColor'),
  fontSize: cssVar('fontXs'),
  userSelect: 'none',
});

export const arrowButtonContainer = style({
  border: '1px solid',
  borderColor: cssVarV2('layer/insideBorder/border'),
  flexShrink: 0,
  borderRadius: '4px',
  overflow: 'hidden',
});

export const arrowButton = style({
  width: 32,
  height: 32,
  borderRadius: 0,
  selectors: {
    '&:first-child': {
      borderRight: '1px solid',
      borderColor: cssVarV2('layer/insideBorder/border'),
    },
  },
});
