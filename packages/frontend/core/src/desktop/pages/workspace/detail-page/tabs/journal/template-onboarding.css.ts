import { cssVarV2 } from '@toeverything/theme/v2';
import { keyframes, style } from '@vanilla-extract/css';

type Timeline = {
  duration: string;
  delay: string;
  easing: string;
  fill?: 'forwards' | 'backwards' | 'both' | 'none';
  keyframes: Parameters<typeof keyframes>[0];
};

/**
 * Timeline for the onboarding animation
 */
export const timeline: Record<'container' | 'card' | 'paper', Timeline> = {
  container: {
    duration: '0.23s',
    delay: '0s',
    easing: 'ease-out',
    keyframes: {
      from: { height: 0 },
      to: { height: 140 },
    },
  },
  card: {
    duration: '0.5s',
    delay: '0.1s',
    easing: 'cubic-bezier(0,1.35,.17,.96)',
    fill: 'forwards',
    keyframes: {
      from: { transform: 'translateY(100%) scale(0.24)' },
      to: { transform: 'translateY(0) scale(1)' },
    },
  },
  paper: {
    duration: '0.5s',
    delay: '0.3s',
    easing: 'cubic-bezier(0,1.06,0,1.09)',
    fill: 'forwards',
    keyframes: {
      from: { transform: 'translate(100px, 100px) rotate(50deg)' },
      to: { transform: 'translate(22px, 42px) rotate(-8.71deg)' },
    },
  },
};
const animation = (tl: Timeline) => ({
  animationName: keyframes(tl.keyframes),
  animationDuration: tl.duration,
  animationTimingFunction: tl.easing,
  animationDelay: tl.delay,
  animationFillMode: tl.fill,
});

export const container = style({
  paddingTop: 8,
  paddingLeft: 16,
  paddingRight: 16,
  paddingBottom: 8,
  marginBottom: 10,
  width: '100%',
  height: timeline.container.keyframes.to.height,
  overflow: 'hidden',
  ...animation(timeline.container),

  selectors: {
    '&[data-animation-played="true"]': {
      animation: 'none',
      height: timeline.container.keyframes.to.height,
    },
  },
});

export const card = style({
  padding: '12px 0px 14px 12px',
  width: '100%',
  height: 124,
  borderRadius: 12,
  border: `1px solid ${cssVarV2.layer.insideBorder.border}`,
  backgroundColor: cssVarV2.layer.background.secondary,
  overflow: 'hidden',
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'space-between',

  transform: timeline.card.keyframes.from.transform,
  ...animation(timeline.card),

  selectors: {
    '&[data-animation-played="true"]': {
      animation: 'none',
      transform: 'none',
    },
  },
});

export const title = style({
  fontSize: 15,
  lineHeight: '24px',
  fontWeight: 600,
  maxWidth: 'calc(100% - 115px)',
});

export const close = style({
  position: 'absolute',
  top: 12,
  right: 12,
});

export const menu = style({
  width: 280,
});

export const paper = style({
  width: 124,
  height: 124,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'absolute',
  right: 0,
  bottom: 0,
  transformOrigin: '0% 100%',
  transform: timeline.paper.keyframes.from.transform,
  ...animation(timeline.paper),

  selectors: {
    '&[data-animation-played="true"]': {
      animation: 'none',
      transform: timeline.paper.keyframes.to.transform,
    },
  },
});
