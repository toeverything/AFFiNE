import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';

const wsSlideAnim = {
  ease: 'cubic-bezier(.45,.21,0,1)',
  duration: '0.5s',
  delay: '0s',
};

export const container = style({
  height: '50px',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 6px',
  borderRadius: 4,
  outline: 'none',
  width: '100%',
  maxWidth: 500,
  color: cssVar('textPrimaryColor'),
  ':hover': {
    cursor: 'pointer',
    background: cssVar('hoverColor'),
  },
});

export const workspaceInfoSlider = style({
  height: 42,
  overflow: 'hidden',
});
export const workspaceInfoSlide = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  transform: 'translateY(0)',
  transition: `transform ${wsSlideAnim.duration} ${wsSlideAnim.ease} ${wsSlideAnim.delay}`,
  selectors: {
    [`.${workspaceInfoSlider}[data-active="true"] &`]: {
      transform: 'translateY(-42px)',
    },
  },
});
export const workspaceInfo = style({
  width: '100%',
  flexGrow: 1,
  overflow: 'hidden',
  height: 42,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  transition: `opacity ${wsSlideAnim.duration} ${wsSlideAnim.ease} ${wsSlideAnim.delay}`,

  selectors: {
    [`.${workspaceInfoSlider}[data-active="true"] &[data-type="normal"]`]: {
      opacity: 0,
    },
    [`.${workspaceInfoSlider}[data-active="false"] &[data-type="events"]`]: {
      opacity: 0,
    },
  },
});

export const workspaceName = style({
  fontSize: cssVar('fontSm'),
  lineHeight: '22px',
  fontWeight: 500,
  userSelect: 'none',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const workspaceStatus = style({
  display: 'flex',
  gap: 2,
  alignItems: 'center',
  fontSize: cssVar('fontXs'),
  lineHeight: '20px',
  fontWeight: 400,
  color: cssVar('black50'),
});
globalStyle(`.${workspaceStatus} svg`, {
  width: 16,
  height: 16,
  color: cssVar('iconSecondary'),
});

export const workspaceActiveStatus = style({
  display: 'flex',
  gap: 2,
  alignItems: 'center',
  fontSize: cssVar('fontSm'),
  lineHeight: '22px',
  color: cssVar('textSecondaryColor'),
});
globalStyle(`.${workspaceActiveStatus} svg`, {
  width: 16,
  height: 16,
  color: cssVar('iconSecondary'),
});

export const workspaceInfoTooltip = style({
  fontSize: cssVar('fontXs'),
  lineHeight: '20px',
  padding: '0 8px',
  minHeight: 20,
});
