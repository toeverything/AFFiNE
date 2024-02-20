import { cssVar } from '@toeverything/theme';
import { keyframes, style } from '@vanilla-extract/css';
const slideDownAndFade = keyframes({
  '0%': {
    opacity: 0,
    transform: 'scale(0.95) translateY(20px)',
  },
  '100%': {
    opacity: 1,
    transform: 'scale(1) translateY(0)',
  },
});
const slideUpAndFade = keyframes({
  '0%': {
    opacity: 1,
    transform: 'scale(1) translateY(0)',
  },
  '100%': {
    opacity: 0,
    transform: 'scale(0.95) translateY(20px)',
  },
});
export const root = style({
  display: 'flex',
  alignItems: 'center',
  borderRadius: '10px',
  padding: '4px',
  border: `1px solid ${cssVar('borderColor')}`,
  boxShadow: cssVar('menuShadow'),
  gap: 4,
  minWidth: 'max-content',
  width: 'fit-content',
  background: cssVar('backgroundPrimaryColor'),
});
export const popoverContent = style({
  willChange: 'transform opacity',
  selectors: {
    '&[data-state="open"]': {
      animation: `${slideDownAndFade} 0.2s ease-in-out`,
    },
    '&[data-state="closed"]': {
      animation: `${slideUpAndFade} 0.2s ease-in-out`,
    },
  },
});
export const separator = style({
  width: '1px',
  height: '24px',
  background: cssVar('dividerColor'),
});
export const item = style({
  display: 'flex',
  alignItems: 'center',
  color: 'inherit',
  gap: 4,
  height: '32px',
  padding: '0 6px',
});
export const button = style([
  item,
  {
    borderRadius: '8px',
    ':hover': {
      background: cssVar('hoverColor'),
    },
  },
]);
export const danger = style({
  color: 'inherit',
  ':hover': {
    background: cssVar('backgroundErrorColor'),
    color: cssVar('errorColor'),
  },
});
export const buttonIcon = style({
  display: 'flex',
  alignItems: 'center',
  fontSize: 20,
  color: cssVar('iconColor'),
  selectors: {
    [`${danger}:hover &`]: {
      color: cssVar('errorColor'),
    },
  },
});
