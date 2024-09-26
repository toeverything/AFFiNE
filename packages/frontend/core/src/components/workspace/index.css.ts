import { cssVar, lightCssVariables } from '@toeverything/theme';
import { createVar, globalStyle, style } from '@vanilla-extract/css';

export const panelWidthVar = createVar('panel-width');

export const appStyle = style({
  width: '100%',
  position: 'relative',
  height: '100dvh',
  flexGrow: '1',
  display: 'flex',
  backgroundColor: cssVar('backgroundPrimaryColor'),
  selectors: {
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
      // TODO(@Peng): figure out how to use vanilla-extract webpack plugin to inject img url
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
  width: '100%',
  display: 'flex',
  flex: 1,
  overflow: 'clip',
  maxWidth: '100%',

  selectors: {
    '&[data-client-border="true"]': {
      borderRadius: 6,
      margin: '8px',
      overflow: 'clip',
      '@media': {
        print: {
          overflow: 'visible',
          margin: '0px',
          borderRadius: '0px',
        },
      },
    },
    '&[data-client-border="true"][data-is-desktop="true"]': {
      marginTop: 0,
    },
    '&[data-client-border="false"][data-is-desktop="true"][data-side-bar-open="true"]':
      {
        borderTopLeftRadius: 6,
      },
    '&[data-client-border="false"][data-is-desktop="true"]': {
      borderTop: `0.5px solid ${cssVar('borderColor')}`,
      borderLeft: `0.5px solid ${cssVar('borderColor')}`,
    },
    '&[data-transparent=true]': {
      backgroundColor: 'transparent',
    },
  },
});
export const toolStyle = style({
  position: 'absolute',
  right: 16,
  bottom: 16,
  zIndex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '12px',
  selectors: {
    '&.trash': {
      bottom: '78px',
    },
  },
});

export const fallbackRootStyle = style({
  paddingTop: 52,
  display: 'flex',
  flex: 1,
  width: '100%',
  height: '100%',
});
