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

export const button = style({
  vars: {
    // default vars
    [gapVar]: '4px',
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
  borderRadius: 8,
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
    '&[data-size="default"]': {
      vars: {
        [hVar]: '28px', // line-height + paddingY * 2 (to ignore border width)
        [paddingVar]: '0px 8px',
        [iconSizeVar]: '16px',
        [paddingVar]: '4px 12px',
        [fontSizeVar]: cssVar('fontXs'),
        [fontWeightVar]: '500',
        [lineHeightVar]: '20px',
      },
    },
    '&[data-size="large"]': {
      vars: {
        [hVar]: '32px',
        [paddingVar]: '0px 8px',
        [iconSizeVar]: '20px',
        [paddingVar]: '4px 12px',
        [fontSizeVar]: '15px',
        [fontWeightVar]: '500',
        [lineHeightVar]: '24px',
      },
    },
    '&[data-size="extraLarge"]': {
      vars: {
        [hVar]: '40px',
        [paddingVar]: '0px 8px',
        [iconSizeVar]: '24px',
        [paddingVar]: '8px 18px',
        [fontSizeVar]: '15',
        [fontWeightVar]: '600',
        [lineHeightVar]: '24px',
      },
    },

    // type
    '&[data-variant="primary"]': {
      vars: {
        [bgVar]: cssVarV2('button/primary'),
        [textVar]: cssVarV2('button/pureWhiteText'),
        [iconColorVar]: cssVarV2('button/pureWhiteText'),
        [borderColorVar]: cssVarV2.layer.insideBorder.blackBorder,
      },
    },
    '&[data-variant="secondary"]': {
      vars: {
        [bgVar]: cssVarV2('button/secondary'),
        [textVar]: cssVarV2('text/primary'),
        [iconColorVar]: cssVarV2('icon/primary'),
        [borderColorVar]: cssVarV2.layer.insideBorder.blackBorder,
      },
    },
    '&[data-variant="plain"]': {
      vars: {
        [bgVar]: 'transparent',
        [textVar]: cssVarV2('text/primary'),
        [iconColorVar]: cssVarV2('icon/primary'),
        [borderColorVar]: 'transparent',
        [borderWidthVar]: '0px',
      },
    },
    '&[data-variant="error"]': {
      vars: {
        [bgVar]: cssVarV2('button/error'),
        [textVar]: cssVarV2('button/pureWhiteText'),
        [iconColorVar]: cssVarV2('button/pureWhiteText'),
        [borderColorVar]: cssVarV2.layer.insideBorder.blackBorder,
      },
    },
    '&[data-variant="success"]': {
      vars: {
        [bgVar]: cssVarV2('button/success'),
        [textVar]: cssVarV2('button/pureWhiteText'),
        [iconColorVar]: cssVarV2('button/pureWhiteText'),
        [borderColorVar]: cssVarV2.layer.insideBorder.blackBorder,
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
      boxShadow: `0 0 0 1px ${cssVarV2('layer/insideBorder/primaryBorder')}`,
    },
    '&[data-mobile=true]:focus-visible::after': {
      content: 'none',
      display: 'none',
    },
  },
});
export const content = style({
  // in case that width is specified by parent and text is too long
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
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
    '&[data-icon-variant="plain"]': {
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
    '&[data-icon-variant="danger"]:hover': {
      vars: {
        [bgVar]: cssVar('backgroundErrorColor'),
        [iconColorVar]: cssVar('errorColor'),
      },
    },
    // disable hover layer for danger type
    '&[data-icon-variant="danger"]:hover:before': {
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
