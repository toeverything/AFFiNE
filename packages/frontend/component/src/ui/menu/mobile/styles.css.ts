import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

import { modalContent } from '../../modal/styles.css';
import { bgColor, iconColor, labelColor } from '../styles.css';

// To override desktop menu style defined in '../styles.css.ts'

export const mobileMenuModal = style({
  selectors: {
    // to make sure it will override the desktop modal style
    [`&.${modalContent}`]: {
      backgroundColor: cssVarV2('layer/background/overlayPanel'),
      boxShadow: cssVar('menuShadow'),
      userSelect: 'none',
      borderRadius: 24,
      minHeight: 0,
      padding: 0,
      overflow: 'hidden',
    },
  },
});

export const slider = style({
  display: 'flex',
  alignItems: 'start',
  transition: 'all 0.23s',
});

export const menuContent = style({
  boxSizing: 'border-box',
  fontSize: 17,
  fontWeight: '400',
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
  width: '100%',
  flexShrink: 0,
  padding: '13px 0px 13px 0px',
  maxHeight: 'calc(100dvh - 32px)',
});

export const mobileMenuItem = style({
  padding: '10px 20px',
  borderRadius: 0,

  ':hover': {
    vars: {
      [bgColor]: 'transparent',
    },
  },
  ':active': {
    vars: {
      [bgColor]: cssVar('hoverColor'),
    },
  },
  selectors: {
    '&.danger': {
      vars: {
        [labelColor]: cssVarV2('button/error'),
        [iconColor]: cssVarV2('button/error'),
      },
    },
    '&.danger:hover': {
      vars: { [bgColor]: 'transparent' },
    },
    '&.danger:active': {
      vars: { [bgColor]: cssVar('backgroundErrorColor') },
    },
    '&.warning:hover': {
      vars: { [bgColor]: 'transparent' },
    },
    '&.warning:active': {
      vars: { [bgColor]: cssVar('backgroundWarningColor') },
    },
    // divider hack
    '&[data-divider=true]': {
      marginBottom: 16,
      position: 'relative',
    },
    '&[data-divider=true]::after': {
      content: '""',
      position: 'absolute',
      bottom: -8,
      left: 0,
      width: '100%',
      borderBottom: `0.5px solid ${cssVarV2('layer/insideBorder/border')}`,
    },
    '&[data-divider=true]:last-child': {
      marginBottom: 0,
    },
    '&[data-divider=true]:last-child::after': {
      display: 'none',
    },
  },
});

export const backButton = style({
  height: 42,
  alignSelf: 'start',
  fontWeight: 600,
  fontSize: 17,
  paddingLeft: 0,
  marginLeft: 20,
  maxWidth: 'calc(100% - 20px)',
});

export const scrollArea = style({
  maxHeight: '80dvh',
});
