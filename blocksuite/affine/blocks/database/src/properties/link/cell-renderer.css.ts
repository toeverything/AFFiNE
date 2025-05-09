import { cssVarV2 } from '@blocksuite/affine-shared/theme';
import { baseTheme } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const linkCellStyle = style({
  width: '100%',
  height: '100%',
  userSelect: 'none',
  position: 'relative',
});

export const linkContainerStyle = style({
  display: 'flex',
  position: 'relative',
  alignItems: 'center',
  width: '100%',
  height: '100%',
  outline: 'none',
  overflow: 'hidden',
  fontSize: 'var(--data-view-cell-text-size)',
  lineHeight: 'var(--data-view-cell-text-line-height)',
  wordBreak: 'break-all',
});
export const linkIconContainerStyle = style({
  position: 'absolute',
  right: '8px',
  top: '8px',
  display: 'flex',
  alignItems: 'center',
  visibility: 'hidden',
  backgroundColor: cssVarV2.layer.background.primary,
  boxShadow: 'var(--affine-button-shadow)',
  borderRadius: '4px',
  overflow: 'hidden',
  zIndex: 1,
});
export const linkIconStyle = style({
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  cursor: 'pointer',
  color: cssVarV2.icon.primary,
  fontSize: '14px',
  padding: '2px',
  ':hover': {
    backgroundColor: cssVarV2.layer.background.hoverOverlay,
  },
});

export const showLinkIconStyle = style({
  selectors: {
    [`${linkCellStyle}:hover &`]: {
      visibility: 'visible',
    },
  },
});

export const linkedDocStyle = style({
  textDecoration: 'underline',
  textDecorationColor: 'var(--affine-divider-color)',
  transition: 'text-decoration-color 0.2s ease-out',
  cursor: 'pointer',
  ':hover': {
    textDecorationColor: 'var(--affine-icon-color)',
  },
});

export const linkEditingStyle = style({
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  padding: '0',
  border: 'none',
  fontFamily: baseTheme.fontSansFamily,
  color: 'var(--affine-text-primary-color)',
  fontWeight: '400',
  backgroundColor: 'transparent',
  fontSize: 'var(--data-view-cell-text-size)',
  lineHeight: 'var(--data-view-cell-text-line-height)',
  wordBreak: 'break-all',
  ':focus': {
    outline: 'none',
  },
});

export const inlineLinkNodeStyle = style({
  wordBreak: 'break-all',
  color: 'var(--affine-link-color)',
  fill: 'var(--affine-link-color)',
  cursor: 'pointer',
  fontWeight: 'normal',
  fontStyle: 'normal',
  textDecoration: 'none',
});

export const normalTextStyle = style({
  wordBreak: 'break-all',
});
