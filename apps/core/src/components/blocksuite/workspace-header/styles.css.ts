import type { ComplexStyleRule } from '@vanilla-extract/css';
import { createContainer, style } from '@vanilla-extract/css';

export const headerVanillaContainer = createContainer();

export const headerContainer = style({
  height: 'auto',
  flexShrink: 0,
  position: 'sticky',
  top: 0,
  background: 'var(--affine-background-primary-color)',
  zIndex: 'var(--affine-z-index-popover)',
  selectors: {
    '&[data-has-warning="true"]': {
      height: '96px',
    },
    '&[data-sidebar-floating="false"]': {
      WebkitAppRegion: 'drag',
    },
  },
  '@media': {
    print: {
      display: 'none',
    },
  },
  ':has([data-popper-placement])': {
    WebkitAppRegion: 'no-drag',
  },
} as ComplexStyleRule);

export const header = style({
  containerName: headerVanillaContainer,
  containerType: 'inline-size',
  flexShrink: 0,
  minHeight: '52px',
  width: '100%',
  padding: '8px 20px',
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  alignItems: 'center',
  background: 'var(--affine-background-primary-color)',
  zIndex: 99,
  position: 'relative',
  selectors: {
    '&[data-is-page-list="true"], &[data-is-edgeless="true"]': {
      borderBottom: `1px solid var(--affine-border-color)`,
    },
  },
  '@container': {
    [`${headerVanillaContainer} (max-width: 900px)`]: {
      alignItems: 'start',
    },
  },
});

export const titleContainer = style({
  width: '100%',
  height: '100%',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  alignContent: 'unset',
  fontSize: 'var(--affine-font-base)',
  ['WebkitAppRegion' as string]: 'no-drag',
  '@container': {
    [`${headerVanillaContainer} (max-width: 900px)`]: {
      alignItems: 'start',
      paddingTop: '2px',
    },
  },
});

export const title = style({
  maxWidth: '620px',
  transition: 'max-width .15s',
  userSelect: 'none',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  '@media': {
    '(max-width: 768px)': {
      selectors: {
        '&[data-open="true"]': {
          WebkitAppRegion: 'no-drag',
        },
      },
    },
  },
} as ComplexStyleRule);
export const pageTitle = style({
  maxWidth: '600px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  transition: 'width .15s',
  cursor: 'pointer',
  '@container': {
    [`${headerVanillaContainer} (max-width: 1920px)`]: {
      maxWidth: '800px',
    },
    [`${headerVanillaContainer} (max-width: 1300px)`]: {
      maxWidth: '400px',
    },
    [`${headerVanillaContainer} (max-width: 768px)`]: {
      maxWidth: '220px',
    },
  },
});
export const titleWrapper = style({
  position: 'relative',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
});
export const headerLeftSide = style({
  display: 'flex',
  alignItems: 'center',
  transition: 'all .15s',
});
export const headerLeftSideColumn = style({
  '@container': {
    [`${headerVanillaContainer} (max-width: 900px)`]: {
      flexDirection: 'column',
      alignItems: 'flex-start',
      height: '68px',
    },
  },
});
export const headerLeftSideItem = style({
  '@container': {
    [`${headerVanillaContainer} (max-width: 900px)`]: {
      position: 'absolute',
      left: '0',
      bottom: '8px',
    },
  },
});
export const headerLeftSideOpen = style({
  '@container': {
    [`${headerVanillaContainer} (max-width: 900px)`]: {
      marginLeft: '20px',
    },
  },
});
export const headerRightSide = style({
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  zIndex: 1,
  marginLeft: '20px',
  justifyContent: 'flex-end',
  transition: 'all .15s',
});

export const headerRightSideColumn = style({
  '@container': {
    [`${headerVanillaContainer} (max-width: 900px)`]: {
      position: 'absolute',
      height: 'auto',
      right: '0',
      bottom: '8px',
      marginRight: '18px',
    },
  },
});
export const headerRightSideWindow = style({
  marginRight: '140px',
});
export const browserWarning = style({
  backgroundColor: 'var(--affine-background-warning-color)',
  color: 'var(--affine-warning-color)',
  height: '36px',
  fontSize: 'var(--affine-font-sm)',
  display: 'none',
  justifyContent: 'center',
  alignItems: 'center',
  selectors: {
    '&[data-show="true"]': {
      display: 'flex',
    },
  },
});

export const closeButton = style({
  width: '36px',
  height: '36px',
  color: 'var(--affine-icon-color)',
  cursor: 'pointer',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  position: 'absolute',
  right: '15px',
  top: 0,
});

export const switchWrapper = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
});

export const searchArrowWrapper = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  marginLeft: '4px',
});

export const pageListTitleWrapper = style({
  fontSize: 'var(--affine-font-base)',
  color: 'var(--affine-text-primary-color)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
});
export const allPageListTitleWrapper = style({
  fontSize: 'var(--affine-font-base)',
  color: 'var(--affine-text-primary-color)',
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  height: '100%',
  '@container': {
    [`${headerVanillaContainer} (max-width: 900px)`]: {
      alignItems: 'flex-start',
      marginTop: '8px',
    },
  },
});
export const pageListTitleIcon = style({
  fontSize: '20px',
  height: '1em',
  marginRight: '12px',
});

export const quickSearchTipButton = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  marginTop: '12px',
  color: '#FFFFFF',
  width: '48px',
  height: ' 26px',
  fontSize: 'var(--affine-font-sm)',
  lineHeight: '22px',
  background: 'var(--affine-primary-color)',
  borderRadius: '8px',
  textAlign: 'center',
  cursor: 'pointer',
});

export const quickSearchTipContent = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-end',
  flexDirection: 'column',
});

export const horizontalDivider = style({
  width: '100%',
  borderTop: `1px solid var(--affine-border-color)`,
});

export const horizontalDividerContainer = style({
  width: '100%',
  padding: '14px',
});

export const windowAppControlsWrapper = style({
  display: 'flex',
  gap: '2px',
  transform: 'translateX(8px)',
  height: '100%',
  position: 'absolute',
  right: '14px',
});

export const windowAppControl = style({
  WebkitAppRegion: 'no-drag',
  cursor: 'pointer',
  display: 'inline-flex',
  width: '51px',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '0',
  selectors: {
    '&[data-type="close"]': {
      width: '56px',
      paddingRight: '5px',
      marginRight: '-12px',
    },
    '&[data-type="close"]:hover': {
      background: 'var(--affine-windows-close-button)',
      color: 'var(--affine-pure-white)',
    },
    '&:hover': {
      background: 'var(--affine-hover-color)',
    },
  },
  '@container': {
    [`${headerVanillaContainer} (max-width: 900px)`]: {
      height: '50px',
      paddingTop: '0',
    },
  },
} as ComplexStyleRule);

export const pluginHeaderItems = style({
  display: 'flex',
  gap: '12px',
  alignItems: 'center',
  height: '100%',
});
