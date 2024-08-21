import { keyframes, style } from '@vanilla-extract/css';

import { block } from '../articles/blocks.css';
import { onboardingVars } from '../style.css';

export const switchButtons = style({
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  padding: '8px',
  borderRadius: '24px',
  background: '#F4F4F5',
  height: '64px',
  width: '128px',
  justifyContent: 'space-between',

  selectors: {
    // indicator
    '&::before': {
      content: '',
      width: '48px',
      height: '48px',
      borderRadius: '16px',
      backgroundColor: 'white',
      position: 'absolute',
      transition: 'transform 0.15s ease',
      boxShadow: 'var(--affine-shadow-1)',
    },
    '&[data-mode="edgeless"]::before': {
      transform: `translateX(64px)`,
    },
  },
});

export const switchButton = style({
  width: 24,
  height: 24,
  transform: 'scale(2)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: 'none',
  opacity: 0.6,
  cursor: 'pointer',
  selectors: {
    '&:nth-child(1)': {
      transformOrigin: 'left',
    },
    '&:nth-child(2)': {
      transformOrigin: 'right',
    },
    '&[data-active="true"]': {
      opacity: 1,
    },
  },
});

const pop = keyframes({
  from: { transform: 'translateY(100%)' },
  to: { transform: 'translateY(0)' },
});
export const toolbar = style({
  cursor: 'not-allowed',
  boxShadow: '0px 0px 12px 0px #4241492E',
  borderRadius: '16px',
  border: `1px solid ${onboardingVars.toolbar.borderColor}`,
  height: '65px',
  overflow: 'hidden',
  backgroundColor: onboardingVars.toolbar.bg,
});
export const toolbarPop = style({
  vars: {
    '--delay': '0s',
  },

  selectors: {
    '[data-mode="edgeless"] &': {
      transform: 'translateY(120%)',
      animation: `${pop} 0.4s cubic-bezier(.04,1.01,.42,1.31) forwards`,
      animationDelay: 'var(--delay)',
    },
  },
});

export const onboardingBlock = style([
  block,
  {
    vars: {
      '--enter-delay': '0ms',
      '--leave-delay': '0ms',
    },
    padding: '0 28px',
    cursor: 'unset',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    marginBottom: '16px',
    border: '2px solid transparent',

    selectors: {
      '&[data-bg-mode="true"]': {
        background: 'var(--bg)',
        // boxShadow: 'var(--affine-menu-shadow)', // dark-mode issue
        boxShadow:
          '0px 0px 12px 0px rgba(66, 65, 73, 0.14), 0px 0px 0px 0.5px #E3E3E4 inset',
        padding: '18px 28px',
        borderColor: 'rgba(0, 0, 0, 0.1)',
      },
      '&[data-invisible="true"]': {
        opacity: 0,
        pointerEvents: 'none',
        marginBottom: 0,
      },
      '&:last-child': {
        marginBottom: 0,
      },
      '&[data-mode="edgeless"], &[data-mode="well-done"]': {
        transition: `all ${onboardingVars.block.transition} var(--enter-delay)`,
      },
      '&[data-mode="page"]': {
        transition: `all ${onboardingVars.block.transition} var(--leave-delay)`,
      },
    },
  },
]);

export const shadowSticker = style({
  position: 'relative',
  borderRadius: '8px',
  boxShadow: '10px 10px 0px 6px #000',
  padding: '22px 24px',

  fontSize: '15px',
  lineHeight: '23px',

  selectors: {
    '&::before': {
      content: '""',
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      borderRadius: 'inherit',
      boxShadow: '0px 0px 0px 6px #000',
    },
    // use data-mode to apply animation only for edgeless mode
    // this is a hacky way to do it
    '[data-mode=edgeless] &[data-animate=true]': {
      animation: `${keyframes({
        from: { boxShadow: '0px 0px 0px 0px #000' },
        to: { boxShadow: '10px 10px 0px 6px #000' },
      })} 0.6s ease forwards`,
    },
  },
});
