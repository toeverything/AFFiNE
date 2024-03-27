import { cssVar, lightCssVariables } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';
export const appStyle = style({
  width: '100%',
  position: 'relative',
  height: '100vh',
  display: 'flex',
  flexGrow: '1',
  flexDirection: 'row',
  backgroundColor: cssVar('backgroundPrimaryColor'),
  selectors: {
    '&[data-is-resizing="true"]': {
      cursor: 'col-resize',
    },
    '&.blur-background': {
      backgroundColor: 'transparent',
    },
    '&.noisy-background::before': {
      content: '""',
      position: 'absolute',
      inset: 0,
      opacity: `var(--affine-noise-opacity, 0)`,
      backgroundRepeat: 'repeat',
      backgroundSize: '50px',
      // todo: figure out how to use vanilla-extract webpack plugin to inject img url
      backgroundImage: `var(--noise-background)`,
    },
  },
});
globalStyle(`html[data-theme="light"] ${appStyle}`, {
  vars: {
    '--affine-noise-opacity': '0.2',
  },
});
globalStyle(`html[data-theme="dark"] ${appStyle}`, {
  vars: {
    '--affine-noise-opacity': '1',
  },
  '@media': {
    print: {
      vars: lightCssVariables,
    },
  },
});
export const mainContainerStyle = style({
  position: 'relative',
  zIndex: 0,
  // it will create stacking context to limit layer of child elements and be lower than after auto zIndex
  width: 0,
  display: 'flex',
  flex: 1,
  overflow: 'clip',
  maxWidth: '100%',
  transition: 'margin-left 0.2s ease',
  selectors: {
    '&[data-client-border="true"]': {
      borderRadius: 6,
      margin: '8px',
      overflow: 'hidden',
      // todo: is this performance intensive?
      // TODO: not match with design's shadow, theme missing
      filter: 'drop-shadow(0px 0px 4px rgba(66,65,73,.14))',
      '@media': {
        print: {
          overflow: 'visible',
          margin: '0px',
          borderRadius: '0px',
        },
      },
    },
    '&[data-client-border="true"][data-side-bar-open="true"]': {
      marginLeft: 0,
    },
    '&[data-client-border="true"]:before': {
      content: '""',
      position: 'absolute',
      height: '8px',
      width: '100%',
      top: '-8px',
      left: 0,
      ['WebkitAppRegion' as string]: 'drag',
    },
    '&[data-transparent=true]': {
      backgroundColor: 'transparent',
    },
  },
});
export const toolStyle = style({
  position: 'absolute',
  right: '30px',
  bottom: '30px',
  zIndex: cssVar('zIndexPopover'),
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  '@media': {
    'screen and (max-width: 960px)': {
      right: 'calc((100vw - 640px) * 3 / 19 + 14px)',
    },
    'screen and (max-width: 640px)': {
      right: '5px',
      bottom: '5px',
    },
    print: {
      display: 'none',
    },
  },
});
