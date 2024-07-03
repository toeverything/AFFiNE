import { cssVar } from '@toeverything/theme';
import {
  createVar,
  generateIdentifier,
  globalStyle,
  keyframes,
  style,
} from '@vanilla-extract/css';

export const animationTimeout = createVar();
export const transformOrigin = createVar();
export const animationType = createVar();

const zoomIn = keyframes({
  from: {
    transform: 'scale(0.10)',
  },
  to: {
    transform: 'scale(1)',
  },
});
const zoomOut = keyframes({
  to: {
    opacity: 0,
    transform: 'scale(0.10)',
  },
  from: {
    opacity: 1,
    transform: 'scale(1)',
  },
});

const fadeIn = keyframes({
  from: {
    opacity: 0,
  },
  to: {
    opacity: 1,
  },
});

const fadeOut = keyframes({
  from: {
    opacity: 1,
  },
  to: {
    opacity: 0,
  },
});

// every item must have its own unique view-transition-name
const vtContentZoom = generateIdentifier('content-zoom');
const vtContentFade = generateIdentifier('content-fade');
const vtOverlayFade = generateIdentifier('content-fade');

globalStyle(`::view-transition-group(${vtOverlayFade})`, {
  animationDuration: animationTimeout,
});

globalStyle(`::view-transition-new(${vtOverlayFade})`, {
  animationName: fadeIn,
});

globalStyle(`::view-transition-old(${vtOverlayFade})`, {
  animationName: fadeOut,
});

globalStyle(
  `::view-transition-group(${vtContentZoom}),
   ::view-transition-group(${vtContentFade})`,
  {
    animationDuration: animationTimeout,
    animationFillMode: 'forwards',
    animationTimingFunction: 'cubic-bezier(0.42, 0, 0.58, 1)',
  }
);

globalStyle(`::view-transition-new(${vtContentZoom})`, {
  animationName: zoomIn,
  // origin has to be set in ::view-transition-new/old
  transformOrigin: transformOrigin,
});

globalStyle(`::view-transition-old(${vtContentZoom})`, {
  animationName: zoomOut,
  transformOrigin: transformOrigin,
});

globalStyle(`::view-transition-new(${vtContentFade})`, {
  animationName: fadeIn,
});

globalStyle(`::view-transition-old(${vtContentFade})`, {
  animationName: fadeOut,
});

export const modalOverlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: cssVar('zIndexModal'),
  backgroundColor: cssVar('black30'),
  viewTransitionName: vtOverlayFade,
  pointerEvents: 'auto',
});

export const modalContentWrapper = style({
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: cssVar('zIndexModal'),
});

export const modalContentContainer = style({
  display: 'flex',
  alignItems: 'flex-start',
  width: '100%',
  height: '100%',
});

export const modalContentContainerWithZoom = style({
  viewTransitionName: vtContentZoom,
});

export const modalContentContainerWithFade = style({
  viewTransitionName: vtContentFade,
});

export const containerPadding = style({
  width: '90%',
  height: '90%',
  maxWidth: 1248,
});

export const modalContent = style({
  flex: 1,
  height: '100%',
  backgroundColor: cssVar('backgroundOverlayPanelColor'),
  backdropFilter: 'drop-shadow(0px 0px 2px rgba(0, 0, 0, 0.08))',
  borderRadius: '8px',
  minHeight: 300,
  // :focus-visible will set outline
  outline: 'none',
  position: 'relative',
  selectors: {
    '&[data-no-interaction=true]': {
      pointerEvents: 'none',
    },
  },
});

export const modalControls = style({
  flexShrink: 0,
  zIndex: -1,
  minWidth: '48px',
  padding: '8px 0 0 16px',
  pointerEvents: 'auto',
});
