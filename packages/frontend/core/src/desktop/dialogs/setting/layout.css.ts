import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
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
  // scrollSnapType: 'x mandatory',
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
  alignItems: 'start',
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
