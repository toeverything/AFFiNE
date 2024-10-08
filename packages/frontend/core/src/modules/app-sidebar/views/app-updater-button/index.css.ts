import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const root = style({
  display: 'inline-flex',
  background: cssVar('white30'),
  alignItems: 'center',
  borderRadius: '8px',
  border: `1px solid ${cssVar('black10')}`,
  fontSize: cssVar('fontSm'),
  width: '100%',
  height: '52px',
  userSelect: 'none',
  cursor: 'pointer',
  padding: '0 12px',
  position: 'relative',
  transition: 'all 0.3s ease',
  selectors: {
    '&:hover': {
      background: cssVar('white60'),
    },
    '&[data-disabled="true"]': {
      pointerEvents: 'none',
    },
    '&:after': {
      content: "''",
      position: 'absolute',
      top: '-2px',
      right: '-2px',
      width: '8px',
      height: '8px',
      backgroundColor: cssVar('primaryColor'),
      borderRadius: '50%',
      zIndex: 1,
      transition: 'opacity 0.3s',
    },
    '&:hover:after': {
      opacity: 0,
    },
  },
  vars: {
    '--svg-dot-animation': `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 122 116'%3E%3Cpath id='b' stroke='%23fff' stroke-linecap='round' stroke-width='0' d='M17.9256 115C17.434 111.774 13.1701 104.086 13.4282 95.6465C13.6862 87.207 18.6628 76.0721 17.9256 64.3628C17.1883 52.6535 8.7772 35.9512 9.00452 25.3907C9.23185 14.8302 16.2114 5.06512 17.9256 1'/%3E%3Cpath id='d' stroke='%23fff' stroke-linecap='round' stroke-width='0' d='M84.1628 115C85.2376 112.055 94.5618 98.8394 93.9975 91.1338C93.4332 83.4281 82.5505 73.2615 84.1628 62.5704C85.775 51.8793 96.4803 35.4248 95.9832 25.7826C95.4861 16.1404 87.9113 4.71163 84.1628 1'/%3E%3Cpath id='f' stroke='%23fff' stroke-linecap='round' stroke-width='0' d='M37.0913 115C37.9604 111.921 44.4347 99.4545 45.3816 92.9773C48.9305 68.7011 35.7877 73.9552 37.0913 62.7781C38.3949 51.6011 47.3889 36.9895 46.9869 26.9091C46.585 16.8286 40.1222 4.88034 37.0913 1'/%3E%3Cpath id='h' stroke='%23fff' stroke-linecap='round' stroke-width='0' d='M112.443 115C111.698 112.235 108.25 106.542 107.715 93.7582C107.241 82.4286 107.229 83.9543 112.443 66.1429C116.085 44.0408 100.661 42.5908 101.006 33.539C101.35 24.4871 109.843 4.48439 112.443 1'/%3E%3Cg%3E%3Ccircle r='1.5' fill='rgba(30, 150, 235, 0.3)'%3E%3CanimateMotion dur='10s' repeatCount='indefinite'%3E%3Cmpath href='%23b' /%3E%3C/animateMotion%3E%3C/circle%3E%3C/g%3E%3Cg%3E%3Ccircle r='1' fill='rgba(30, 150, 235, 0.3)' fill-opacity='1' shape-rendering='crispEdges'%3E%3CanimateMotion dur='8s' repeatCount='indefinite'%3E%3Cmpath href='%23d' /%3E%3C/animateMotion%3E%3C/circle%3E%3C/g%3E%3Cg%3E%3Ccircle r='.5' fill='rgba(30, 150, 235, 0.3)' fill-opacity='1' shape-rendering='crispEdges'%3E%3CanimateMotion dur='4s' repeatCount='indefinite'%3E%3Cmpath href='%23f' /%3E%3C/animateMotion%3E%3C/circle%3E%3C/g%3E%3Cg%3E%3Ccircle r='.8' fill='rgba(30, 150, 235, 0.3)' fill-opacity='1' shape-rendering='crispEdges'%3E%3CanimateMotion dur='6s' repeatCount='indefinite'%3E%3Cmpath href='%23h' /%3E%3C/animateMotion%3E%3C/circle%3E%3C/g%3E%3C/svg%3E")`,
  },
});
export const icon = style({
  marginRight: '12px',
  color: cssVar('iconColor'),
  fontSize: '24px',
});
export const closeIcon = style({
  position: 'absolute',
  top: '4px',
  right: '4px',
  height: '14px',
  width: '14px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: cssVar('shadow1'),
  color: cssVar('textSecondaryColor'),
  backgroundColor: cssVar('backgroundPrimaryColor'),
  fontSize: '14px',
  cursor: 'pointer',
  transition: '0.1s',
  borderRadius: '50%',
  transform: 'scale(0.6)',
  zIndex: 1,
  opacity: 0,
  selectors: {
    '&:hover': {
      transform: 'scale(1.1)',
    },
    [`${root}:hover &`]: {
      opacity: 1,
      transform: 'scale(1)',
    },
  },
});
export const installLabel = style({
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  flex: 1,
  fontSize: cssVar('fontSm'),
  whiteSpace: 'nowrap',
  justifyContent: 'space-between',
});
export const installLabelNormal = style([
  installLabel,
  {
    justifyContent: 'flex-start',
    selectors: {
      [`${root}:hover &, ${root}[data-updating=true] &`]: {
        display: 'none',
      },
    },
  },
]);
export const installLabelHover = style([
  installLabel,
  {
    display: 'none',
    justifyContent: 'flex-start',
    selectors: {
      [`${root}:hover &, ${root}[data-updating=true] &`]: {
        display: 'flex',
      },
    },
  },
]);
export const updateAvailableWrapper = style({
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
  width: '100%',
  height: '100%',
  padding: '8px 0',
});
export const versionLabel = style({
  padding: '0 6px',
  color: cssVar('textSecondaryColor'),
  background: cssVar('backgroundPrimaryColor'),
  fontSize: '10px',
  lineHeight: '18px',
  borderRadius: '4px',
  marginLeft: '8px',
  maxWidth: '100px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});
export const whatsNewLabel = style({
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  height: '100%',
  fontSize: cssVar('fontSm'),
  whiteSpace: 'nowrap',
});
export const ellipsisTextOverflow = style({
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});
export const progress = style({
  position: 'relative',
  width: '100%',
  height: '4px',
  borderRadius: '12px',
  background: cssVar('black10'),
});
export const progressInner = style({
  position: 'absolute',
  top: 0,
  left: 0,
  height: '100%',
  borderRadius: '12px',
  background: cssVar('primaryColor'),
  transition: '0.1s',
});
export const particles = style({
  background: `var(--svg-dot-animation), var(--svg-dot-animation)`,
  backgroundRepeat: 'no-repeat, repeat',
  backgroundPosition: 'center, center top 100%',
  backgroundSize: '100%, 130%',
  maskImage: 'linear-gradient(to top, transparent, black, black, transparent)',
  width: '100%',
  height: '100%',
  position: 'absolute',
  left: 0,
  pointerEvents: 'none',
  display: 'none',
  selectors: {
    [`${root}:hover &, ${root}[data-updating=true] &`]: {
      display: 'block',
    },
    '&:before': {
      content: '""',
      display: 'block',
      position: 'absolute',
      width: '100%',
      height: '100%',
      background: `var(--svg-dot-animation), var(--svg-dot-animation), var(--svg-dot-animation)`,
      backgroundRepeat: 'no-repeat, repeat, repeat',
      backgroundPosition: 'center, center top 100%, center center',
      backgroundSize: '100% 120%, 150%, 120%',
      filter: 'blur(1px)',
      willChange: 'filter',
      pointerEvents: 'none',
    },
  },
});
export const halo = style({
  overflow: 'hidden',
  position: 'absolute',
  inset: 0,
  ':before': {
    content: '""',
    display: 'block',
    inset: 0,
    position: 'absolute',
    filter: 'blur(10px) saturate(1.2)',
    transition: '0.3s ease',
    willChange: 'filter, transform',
    transform: 'translateY(100%) scale(0.6)',
    background:
      'radial-gradient(ellipse 60% 80% at bottom, rgba(30, 150, 235, 0.35), transparent)',
  },
  ':after': {
    content: '""',
    display: 'block',
    inset: 0,
    position: 'absolute',
    filter: 'blur(10px) saturate(1.2)',
    transition: '0.1s ease',
    willChange: 'filter, transform',
    transform: 'translateY(100%) scale(0.6)',
    background:
      'radial-gradient(ellipse 30% 45% at bottom, rgba(30, 150, 235, 0.6), transparent)',
  },
  selectors: {
    [`${root}:hover &:before, ${root}:hover &:after,
      ${root}[data-updating=true] &:before, ${root}[data-updating=true] &:after`]:
      {
        transform: 'translateY(0) scale(1)',
      },
  },
});
