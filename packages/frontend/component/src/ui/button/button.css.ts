import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { createVar, globalStyle, style } from '@vanilla-extract/css';

// Using variables can override externally, without considering the priority of selectors.
// size vars
export const hVar = createVar('height');
export const wVar = createVar('width');
export const iconSizeVar = createVar('iconSize');
const gapVar = createVar('gap');
const paddingVar = createVar('padding');
const fontSizeVar = createVar('fontSize');
const fontWeightVar = createVar('fontWeight');
const lineHeightVar = createVar('lineHeight');
const shadowVar = createVar('shadow');

// style vars
const bgVar = createVar('bg');
const textVar = createVar('fg');
const iconColorVar = createVar('icon');
const borderColorVar = createVar('border');
const borderWidthVar = createVar('borderWidth');

// base
const defaultTextColor = '#1D262A';
const primaryTextColor = '#F8FAFB';

// default variant
const defaultDefaultColor = '#E5E9EC';
const defaultPrimaryColor = '#959CA5';

// brand variant
const brandDefaultColor = '#D8EAF7';
const brandPrimaryColor = '#36A1F0';

// hover
const defaultDefaultHover = '#DCE1E4';
const defaultPrimaryHover = '#7B828A';
const brandDefaultHover = '#C8E3F6';
const brandPrimaryHover = '#2D86C8';

// active
const defaultDefaultActive = '#C9CFD4';
const defaultPrimaryActive = '#495258';
const brandDefaultActive = '#A6D3F5';
const brandPrimaryActive = '#1B547E';

// pressed
const defaultDefaultPressed = '#D3D8DC';
const defaultPrimaryPressed = '#616971';
const brandDefaultPressed = '#B7DBF6';
const brandPrimaryPressed = '#246DA2';

export const button = style({
  vars: {
    // default vars
    [gapVar]: '6px',
    [wVar]: 'unset',
    [hVar]: 'unset',
    [borderWidthVar]: '1px',
  },

  flexShrink: 0,
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  userSelect: 'none',
  outline: 0,
  borderRadius: 4,
  transition: 'all .3s',
  ['WebkitAppRegion' as string]: 'no-drag',

  // hover layer
  ':before': {
    content: '""',
    position: 'absolute',
    width: '100%',
    height: '100%',
    transition: 'inherit',
    borderRadius: 'inherit',
    opacity: 0,
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: cssVarV2('layer/background/hoverOverlay'),
    borderColor: 'transparent',
    pointerEvents: 'none',
    borderWidth: 'inherit',
    borderStyle: 'inherit',
  },

  // style
  backgroundColor: bgVar,
  color: textVar,
  boxShadow: shadowVar,
  borderWidth: borderWidthVar,
  borderStyle: 'solid',
  borderColor: borderColorVar,

  // size
  width: wVar,
  height: hVar,
  gap: gapVar,
  padding: paddingVar,
  fontSize: fontSizeVar,
  fontWeight: fontWeightVar,
  lineHeight: lineHeightVar,

  selectors: {
    // hover layer
    '&[data-no-hover]:before, &[data-disabled]:before': {
      display: 'none',
    },
    '&:hover:before': { opacity: 1 },
    '&[data-block]': { display: 'flex' },

    // size
    '&[data-size="300"]': {
      vars: {
        [hVar]: '24px', // line-height + paddingY * 2 (to ignore border width)
        [iconSizeVar]: '12px',
        [paddingVar]: '6px',
        [fontSizeVar]: cssVar('fontXs'),
        [fontWeightVar]: '300',
        [lineHeightVar]: '14px',
      },
    },
    '&[data-size="400"]': {
      vars: {
        [hVar]: '28px', // line-height + paddingY * 2 (to ignore border width)
        [iconSizeVar]: '16px',
        [paddingVar]: '6px 8px',
        [fontSizeVar]: cssVar('fontXs'),
        [fontWeightVar]: '400',
        [lineHeightVar]: '16px',
      },
    },
    '&[data-size="500"]': {
      vars: {
        [hVar]: '36px',
        [iconSizeVar]: '24px',
        [paddingVar]: '8px 12px',
        [fontSizeVar]: '16px',
        [fontWeightVar]: '500',
        [lineHeightVar]: '20px',
      },
    },

    // type
    '&[data-variant="default"][data-importance="default"]': {
      vars: {
        [bgVar]: defaultDefaultColor,
        [textVar]: defaultTextColor,
        [iconColorVar]: defaultTextColor,
        [borderColorVar]: defaultDefaultColor,
      },
    },
    '&[data-variant="default"][data-importance="primary"]': {
      vars: {
        [bgVar]: defaultPrimaryColor,
        [textVar]: primaryTextColor,
        [iconColorVar]: primaryTextColor,
        [borderColorVar]: defaultPrimaryColor,
      },
    },
    '&[data-variant="brand"][data-importance="default"]': {
      vars: {
        [bgVar]: brandDefaultColor,
        [textVar]: defaultTextColor,
        [iconColorVar]: defaultTextColor,
        [borderColorVar]: brandDefaultColor,
      },
    },
    '&[data-variant="brand"][data-importance="primary"]': {
      vars: {
        [bgVar]: brandPrimaryColor,
        [textVar]: primaryTextColor,
        [iconColorVar]: primaryTextColor,
        [borderColorVar]: brandPrimaryColor,
      },
    },

    // hover states
    '&[data-variant="default"][data-importance="default"]:hover': {
      vars: {
        [bgVar]: defaultDefaultHover,
      },
    },
    '&[data-variant="default"][data-importance="primary"]:hover': {
      vars: {
        [bgVar]: defaultPrimaryHover,
      },
    },
    '&[data-variant="brand"][data-importance="default"]:hover': {
      vars: {
        [bgVar]: brandDefaultHover,
      },
    },
    '&[data-variant="brand"][data-importance="primary"]:hover': {
      vars: {
        [bgVar]: brandPrimaryHover,
      },
    },

    // active states
    '&[data-variant="default"][data-importance="default"]:active': {
      vars: {
        [bgVar]: defaultDefaultActive,
      },
    },
    '&[data-variant="default"][data-importance="primary"]:active': {
      vars: {
        [bgVar]: defaultPrimaryActive,
      },
    },
    '&[data-variant="brand"][data-importance="default"]:active': {
      vars: {
        [bgVar]: brandDefaultActive,
      },
    },
    '&[data-variant="brand"][data-importance="primary"]:active': {
      vars: {
        [bgVar]: brandPrimaryActive,
      },
    },

    // pressed states
    '&[data-variant="default"][data-importance="default"][data-pressed]': {
      vars: {
        [bgVar]: defaultDefaultPressed,
      },
    },
    '&[data-variant="default"][data-importance="primary"][data-pressed]': {
      vars: {
        [bgVar]: defaultPrimaryPressed,
      },
    },
    '&[data-variant="brand"][data-importance="default"][data-pressed]': {
      vars: {
        [bgVar]: brandDefaultPressed,
      },
    },
    '&[data-variant="brand"][data-importance="primary"][data-pressed]': {
      vars: {
        [bgVar]: brandPrimaryPressed,
      },
    },

    // disabled
    '&[data-disabled]': {
      opacity: 0.5,
    },

    '&:not([data-disabled])': {
      cursor: 'pointer',
    },

    // default keyboard focus style
    '&:focus-visible::after': {
      content: '""',
      width: '100%',
      height: '100%',
      position: 'absolute',
      top: 0,
      left: 0,
      borderRadius: 'inherit',
      boxShadow: `0 0 0 4px ${bgVar}66`,
    },
    '&[data-mobile=true]:focus-visible::after': {
      content: 'none',
      display: 'none',
    },
  },
});

export const contentWrapper = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  transition: 'opacity 0.2s ease',
  flex: 1,
  minWidth: 0,
});

export const content = style({
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  flexShrink: 1,
  minWidth: 0,
});

export const hiddenContent = style({
  opacity: 0,
});

export const loaderOverlay = style({
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const icon = style({
  flexShrink: 0,
  // There are two kinds of icon size:
  // 1. control by props: width and height
  width: iconSizeVar,
  height: iconSizeVar,
  // 2. width/height is set to `1em`
  fontSize: iconSizeVar,
  color: iconColorVar,
  display: 'flex',
  alignItems: 'center',
});
globalStyle(`${icon} > svg`, {
  width: '100%',
  height: '100%',
  display: 'block',
});

export const iconButton = style({
  vars: {
    [paddingVar]: '2px',
    // TODO(@CatsJuice): Replace with theme variables when ready
    '--shadow':
      '0px 0px 1px 0px rgba(0, 0, 0, 0.12), 0px 1px 5px 0px rgba(0, 0, 0, 0.12)',
  },
  borderRadius: 4,
  selectors: {
    '[data-theme="dark"] &': {
      vars: {
        '--shadow':
          '0px 0px 1px 0px rgba(0, 0, 0, 0.66), 0px 1px 5px 0px rgba(0, 0, 0, 0.72)',
      },
    },
    '&[data-icon-variant="default"]': {
      vars: {
        [bgVar]: 'transparent',
        [iconColorVar]: cssVarV2('icon/primary'),
        [borderColorVar]: 'transparent',
        [borderWidthVar]: '0px',
      },
    },
    '&[data-icon-variant="danger"]': {
      vars: {
        [bgVar]: 'transparent',
        [iconColorVar]: cssVarV2('icon/primary'),
        [borderColorVar]: 'transparent',
        [borderWidthVar]: '0px',
      },
    },

    '&[data-variant="default"][data-importance="default"]:hover': {
      vars: {
        [bgVar]: '#DCE1E4',
      },
    },

    // disable hover layer for danger type
    '&[data-variant="default"][data-importance="default"]:hover:before': {
      opacity: 0,
    },
    '&[data-icon-variant="solid"]': {
      vars: {
        [bgVar]: cssVarV2('button/iconButtonSolid'),
        [iconColorVar]: cssVarV2('icon/primary'),
        [borderColorVar]: 'transparent',
        [shadowVar]: 'var(--shadow)',
      },
    },

    '&[data-icon-size="24"]': {
      vars: { [paddingVar]: '4px' },
    },
  },
});
