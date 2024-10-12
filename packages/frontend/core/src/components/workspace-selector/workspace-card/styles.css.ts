import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
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
  color: cssVarV2('text/primary'),
  ':hover': {
    cursor: 'pointer',
    background: cssVar('hoverColor'),
  },
});
export const infoContainer = style({
  width: 0,
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  position: 'relative',
});
export const activeContainer = style({
  flexShrink: 0,
});

export const disable = style({
  pointerEvents: 'none',
  opacity: 0.8,
  ':hover': {
    cursor: 'default',
    background: 'none',
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
  width: '100%',
  display: 'inline-block',
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
  display: 'block',
});

export const workspaceInfoTooltip = style({
  fontSize: cssVar('fontXs'),
  lineHeight: '20px',
  padding: '0 8px',
  minHeight: 20,
});

export const workspaceTitleContainer = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  flex: 1,
  overflow: 'hidden',
});

export const enableCloudButton = style({
  opacity: 0,
  selectors: {
    [`.${container}:hover &`]: {
      opacity: 1,
    },
  },
});

export const collaborationIcon = style({
  color: cssVarV2('icon/secondary'),
  fontSize: 14,
});

export const settingButton = style({
  transition: 'all 0.13s ease',
  width: 0,
  height: 20,
  overflow: 'hidden',
  marginLeft: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  placeItems: 'center',
  color: cssVarV2('icon/primary'),

  borderRadius: 4,
  boxShadow: 'none',
  background: 'transparent',
  cursor: 'pointer',

  selectors: {
    [`.${container}:hover &`]: {
      width: 20,
      boxShadow: cssVar('buttonShadow'),
      background: cssVarV2('button/secondary'),
    },
  },
});

export const showOnCardHover = style({
  position: 'absolute',
  right: 0,
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  selectors: {
    [`.${container}:hover &`]: {
      position: 'relative',
    },
  },
});

export const activeIcon = style({
  fontSize: 14,
  color: cssVarV2('icon/activated'),
});
