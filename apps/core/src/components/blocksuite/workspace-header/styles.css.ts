import type { ComplexStyleRule } from '@vanilla-extract/css';
import { style } from '@vanilla-extract/css';

export const headerContainer = style({
  height: '52px',
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
  flexShrink: 0,
  height: '52px',
  width: '100%',
  padding: '0 20px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  background: 'var(--affine-background-primary-color)',
  zIndex: 99,
  position: 'relative',
  selectors: {
    '&[data-is-edgeless="true"]': {
      borderBottom: `1px solid var(--affine-border-color)`,
    },
  },
});

export const titleContainer = style({
  width: '100%',
  height: '100%',
  margin: 'auto',
  position: 'absolute',
  inset: 'auto auto auto 50%',
  transform: 'translate(-50%, 0px)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  alignContent: 'unset',
  fontSize: 'var(--affine-font-base)',
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

export const titleWrapper = style({
  height: '100%',
  position: 'relative',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
});

export const headerRightSide = style({
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  zIndex: 1,
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
  position: 'absolute',
  right: '100%',
  top: 0,
  bottom: 0,
  margin: 'auto',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
});

export const searchArrowWrapper = style({
  position: 'absolute',
  left: 'calc(100% + 4px)',
  top: 0,
  bottom: 0,
  margin: 'auto',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
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
  justifyContent: 'center',
  alignItems: 'center',
  '::after': {
    content: '""',
    display: 'block',
    width: '100%',
    height: '1px',
    background: 'var(--affine-border-color)',
    position: 'absolute',
    bottom: 0,
    left: 0,
    margin: '0 1px',
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
});

export const windowAppControl = style({
  WebkitAppRegion: 'no-drag',
  cursor: 'pointer',
  display: 'inline-flex',
  width: '42px',
  height: 'calc(100% - 10px)',
  paddingTop: '10px',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '0',
  selectors: {
    '&[data-type="close"]': {
      width: '56px',
      paddingRight: '14px',
      marginRight: '-14px',
    },
    '&[data-type="close"]:hover': {
      background: 'var(--affine-error-color)',
      color: '#FFFFFF',
    },
    '&:hover': {
      background: 'var(--affine-background-tertiary-color)',
    },
  },
} as ComplexStyleRule);
