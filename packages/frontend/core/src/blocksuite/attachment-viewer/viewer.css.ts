import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const viewer = style({
  position: 'relative',
  zIndex: 0,
  display: 'flex',
  flex: 1,
  overflow: 'hidden',
  resize: 'none',
  selectors: {
    '&:before': {
      position: 'absolute',
      content: '',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      zIndex: -1,
    },
    '&:not(.gridding):before': {
      backgroundColor: cssVarV2('layer/background/secondary'),
    },
    '&.gridding:before': {
      opacity: 0.25,
      backgroundSize: '20px 20px',
      backgroundImage: `linear-gradient(${cssVarV2('button/grabber/default')} 1px, transparent 1px), linear-gradient(to right, ${cssVarV2('button/grabber/default')} 1px, transparent 1px)`,
    },
  },
});

export const viewerContainer = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '100%',
});

export const titlebar = style({
  display: 'flex',
  justifyContent: 'space-between',
  height: '52px',
  padding: '10px 8px',
  background: cssVarV2('layer/background/primary'),
  fontSize: '12px',
  fontWeight: 400,
  color: cssVarV2('text/secondary'),
  borderTopWidth: '0.5px',
  borderTopStyle: 'solid',
  borderTopColor: cssVarV2('layer/insideBorder/border'),
  textWrap: 'nowrap',
  overflow: 'hidden',
});

export const titlebarChild = style({
  overflow: 'hidden',
  selectors: {
    [`${titlebar} > &`]: {
      display: 'flex',
      gap: '12px',
      alignItems: 'center',
      paddingLeft: '12px',
      paddingRight: '12px',
    },
    '&.zoom:not(.show)': {
      display: 'none',
    },
  },
});

export const titlebarName = style({
  display: 'flex',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'pre',
  wordWrap: 'break-word',
});
