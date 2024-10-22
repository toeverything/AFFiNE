import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const toolStyle = style({
  selectors: {
    '&.hide': {
      pointerEvents: 'none',
    },
  },
});

export const aiIslandWrapper = style({
  width: 44,
  height: 44,
  position: 'relative',
  transform: 'translateY(0)',
  transition: 'transform 0.2s ease',

  selectors: {
    '&[data-hide="true"]': {
      transform: 'translateY(120px)',
      transitionDelay: '0.2s',
    },
  },
});
export const aiIslandBtn = style({
  width: 'inherit',
  height: 'inherit',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '50%',
  color: cssVar('iconColor'),
  border: `0.5px solid ${cssVar('borderColor')}`,
  boxShadow: '0px 2px 2px rgba(0,0,0,0.05)',
  background: cssVar('backgroundOverlayPanelColor'),
  position: 'relative',

  selectors: {
    [`${aiIslandWrapper}[data-animation="true"] &`]: {
      borderColor: 'transparent',
    },
    '&:hover::after': {
      content: '""',
      position: 'absolute',
      inset: 0,
      borderRadius: '50%',
      background: cssVar('hoverColor'),
    },
  },
});
