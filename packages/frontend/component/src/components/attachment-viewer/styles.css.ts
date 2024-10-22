import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

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
});

export const titlebarChild = style({
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
});

export const body = style({
  display: 'flex',
  flex: 1,
  position: 'relative',
  selectors: {
    '&:before': {
      position: 'absolute',
      content: '',
      width: '100%',
      height: '100%',
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

export const error = style({
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '4px',
});

export const errorTitle = style({
  fontSize: '15px',
  fontWeight: 500,
  lineHeight: '24px',
  color: cssVarV2('text/primary'),
  marginTop: '12px',
});

export const errorMessage = style({
  fontSize: '12px',
  fontWeight: 500,
  lineHeight: '20px',
  color: cssVarV2('text/tertiary'),
});

export const errorBtns = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  marginTop: '28px',
});

export const viewer = style({});

export const viewerViewport = style({});

export const viewerPage = style({
  margin: '20px auto',
  background: cssVarV2('layer/white'),
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: cssVarV2('layer/insideBorder/border'),
  boxShadow:
    '0px 4px 20px 0px var(--transparent-black-200, rgba(0, 0, 0, 0.10))',
});

export const thumbnails = style({
  position: 'absolute',
  boxSizing: 'border-box',
  width: '120px',
  padding: '12px',
  right: '30px',
  bottom: '30px',
  borderRadius: '8px',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: cssVarV2('layer/insideBorder/border'),
  backgroundColor: cssVarV2('layer/background/primary'),
  boxShadow: cssVarV2('shadow/overlayPanelShadow/2-color'),
  fontSize: '12px',
  fontWeight: 500,
  lineHeight: '20px',
  color: cssVarV2('text/secondary'),
});

export const thumbnailsPages = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  selectors: {
    '&.collapsed': {
      display: 'none',
    },
    '&:not(.collapsed)': {
      marginBottom: '8px',
    },
  },
});

export const thumbnailsPage = style({
  display: 'flex',
  width: '100%',
  borderRadius: '4px',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: cssVarV2('layer/insideBorder/border'),
  selectors: {
    '&.selected': {
      borderColor: '#29A3FA',
    },
  },
});

export const thumbnailsIndicator = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
});
