import { cssVar } from '@toeverything/theme';
import { globalStyle, keyframes, style } from '@vanilla-extract/css';
export const plansLayoutRoot = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
});
export const scrollArea = style({
  marginLeft: 'calc(-1 * var(--setting-modal-gap-x))',
  paddingLeft: 'var(--setting-modal-gap-x)',
  width: 'var(--setting-modal-width)',
  overflowX: 'auto',
  scrollSnapType: 'x mandatory',
  paddingBottom: '21px',
  /** Avoid box-shadow clipping */
  paddingTop: '21px',
  marginTop: '-21px',
});
export const scrollBar = style({
  display: 'flex',
  alignItems: 'center',
  userSelect: 'none',
  touchAction: 'none',
  height: '9px',
  width: '100%',
});
export const scrollThumb = style({
  background: cssVar('iconSecondary'),
  opacity: 0.6,
  overflow: 'hidden',
  height: '4px',
  borderRadius: '4px',
  vars: {
    '--radix-scroll-area-thumb-height': '4px',
  },
});
export const allPlansLink = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  color: cssVar('linkColor'),
  background: 'transparent',
  borderColor: 'transparent',
  fontSize: cssVar('fontXs'),
});

export const collapsibleHeader = style({
  display: 'flex',
  marginBottom: 8,
});
export const collapsibleHeaderContent = style({
  width: 0,
  flex: 1,
});
export const collapsibleHeaderTitle = style({
  fontWeight: 600,
  fontSize: cssVar('fontBase'),
  lineHeight: '22px',
});
export const collapsibleHeaderCaption = style({
  fontWeight: 400,
  fontSize: cssVar('fontXs'),
  lineHeight: '20px',
  color: cssVar('textSecondaryColor'),
});

export const affineCloudHeader = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 24,
});
export const aiDivider = style({
  opacity: 0,
  selectors: {
    '[data-ai-visible] &': {
      opacity: 1,
    },
  },
});

const slideInBottom = keyframes({
  from: {
    marginBottom: -100,
  },
  to: {
    marginBottom: 0,
  },
});
export const aiScrollTip = style({
  position: 'absolute',
  zIndex: 1,
  bottom: 12,
  width: 'var(--setting-modal-content-width)',
  background: cssVar('white'),
  borderRadius: 8,
  border: `1px solid ${cssVar('borderColor')}`,
  transition: 'transform 0.36s ease 0.4s, opacity 0.3s ease 0.46s',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 20px 12px 16px',
  boxShadow: cssVar('shadow1'),
  marginBottom: -100,

  animation: `${slideInBottom} 0.3s ease 0.5s forwards`,

  selectors: {
    '[data-ai-visible] &': {
      transform: 'translateY(100px)',
      opacity: 0,
    },
  },
});
// to override `display: contents !important` in `scrollable.tsx`
globalStyle(`div.${aiScrollTip}`, {
  display: 'flex !important',
});
export const aiScrollTipLabel = style({
  display: 'flex',
  alignItems: 'center',
});
export const aiScrollTipText = style({
  padding: '0px 10px 0px 8px',
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
  lineHeight: '22px',
  color: cssVar('textPrimaryColor'),
});
export const aiScrollTipTag = style({
  background: 'linear-gradient(180deg, #41B0FF 0%, #0873BE 100%)',
  borderRadius: 3,
  fontWeight: 600,
  fontSize: 10,
  lineHeight: '12px',
  letterSpacing: '-1%',
  color: cssVar('pureWhite'),
  boxShadow:
    '0px 0px 1px 0px #45474926, 1px 2px 2px 0px #45474921, 2px 4px 3px 0px #45474914,  4px 6px 3px 0px #45474905,  6px 10px 3px 0px #45474900',
  padding: 1,
});

export const aiScrollTipTagInner = style({
  borderRadius: 2,
  padding: '2px 3px',
  fontWeight: 'inherit',
  fontSize: 'inherit',
  lineHeight: 'inherit',
  content: 'var(--content, "")',
  letterSpacing: 'inherit',
  background:
    'linear-gradient(180deg, #56B9FF 0%, #23A4FF 37.88%, #1E96EB 75%)',
});
