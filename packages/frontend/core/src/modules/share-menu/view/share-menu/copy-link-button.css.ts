import { cssVarV2 } from '@toeverything/theme/v2';
import { createContainer, globalStyle, style } from '@vanilla-extract/css';

const copyLinkContainer = createContainer('copy-link-container');

export const copyLinkContainerStyle = style({
  containerName: copyLinkContainer,
  containerType: 'inline-size',
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  position: 'relative',
  selectors: {
    '&.secondary': {
      padding: 0,
      marginTop: '12px',
    },
  },
});
export const copyLinkButtonStyle = style({
  flex: 1,
  padding: '4px 12px',
  height: '30px',
  paddingRight: '6px',
  borderRadius: '4px',
  borderRight: 'none',
  borderTopRightRadius: '0',
  borderBottomRightRadius: '0',
  color: 'transparent',
  position: 'initial',
  selectors: {
    '&.dark': {
      backgroundColor: cssVarV2('layer/pureBlack'),
    },
    '&.dark::hover': {
      backgroundColor: cssVarV2('layer/pureBlack'),
    },
  },
});
export const copyLinkLabelContainerStyle = style({
  width: '100%',
  borderRight: 'none',
  borderRadius: '4px',
  borderTopRightRadius: '0',
  borderBottomRightRadius: '0',
  position: 'relative',
});
export const copyLinkLabelStyle = style({
  position: 'absolute',
  textAlign: 'end',
  top: '50%',
  left: '50%',
  transform: 'translateX(-50%) translateY(-50%)',
  lineHeight: '20px',
  color: cssVarV2('text/pureWhite'),
  selectors: {
    '&.secondary': {
      color: cssVarV2('text/primary'),
    },
  },
});
export const copyLinkShortcutStyle = style({
  position: 'absolute',
  textAlign: 'end',
  top: '50%',
  right: '52px',
  transform: 'translateY(-50%)',
  opacity: 0.5,
  lineHeight: '20px',
  color: cssVarV2('text/pureWhite'),
  '@container': {
    [`${copyLinkContainer} (max-width: 320px)`]: {
      display: 'none',
    },
  },
  selectors: {
    '&.secondary': {
      color: cssVarV2('text/secondary'),
    },
  },
});
export const copyLinkTriggerStyle = style({
  padding: '4px 12px 4px 8px',
  borderRadius: '4px',
  height: '30px',
  borderLeft: 'none',
  borderTopLeftRadius: '0',
  borderBottomLeftRadius: '0',
  ':hover': {
    backgroundColor: cssVarV2('button/primary'),
    color: cssVarV2('button/pureWhiteText'),
  },
  '::after': {
    content: '""',
    position: 'absolute',
    left: '0',
    top: '0',
    height: '100%',
    width: '1px',
    backgroundColor: cssVarV2('button/innerBlackBorder'),
  },
  selectors: {
    '&.secondary': {
      backgroundColor: cssVarV2('button/secondary'),
      color: cssVarV2('text/secondary'),
    },
    '&.secondary:hover': {
      backgroundColor: cssVarV2('button/secondary'),
      color: cssVarV2('text/secondary'),
    },
  },
});
globalStyle(`${copyLinkTriggerStyle} svg`, {
  color: cssVarV2('button/pureWhiteText'),
  transform: 'translateX(2px)',
});
globalStyle(`${copyLinkTriggerStyle}.secondary svg`, {
  color: cssVarV2('text/secondary'),
  transform: 'translateX(2px)',
});
export const copyLinkMenuItemStyle = style({
  padding: '4px',
  transition: 'all 0.3s',
});
