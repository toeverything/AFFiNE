import { globalStyle, style } from '@vanilla-extract/css';

export const root = style({});

export const commandsContainer = style({
  height: 'calc(100% - 65px)',
  padding: '8px 6px 18px 6px',
});

export const searchInput = style({
  height: 66,
  color: 'var(--affine-text-primary-color)',
  fontSize: 'var(--affine-font-h-5)',
  padding: '21px 24px',
  width: '100%',
  borderBottom: '1px solid var(--affine-border-color)',
  flexShrink: 0,
});

export const panelContainer = style({
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
});

globalStyle(`${root} [cmdk-root]`, {
  height: '100%',
});

globalStyle(`${root} [cmdk-group-heading]`, {
  padding: '8px',
  color: 'var(--affine-text-secondary-color)',
  fontSize: 'var(--affine-font-xs)',
  fontWeight: 600,
  lineHeight: '1.67',
});

globalStyle(`${root} [cmdk-group][hidden]`, {
  display: 'none',
});

globalStyle(`${root} [cmdk-list]`, {
  maxHeight: 400,
  overflow: 'auto',
  overscrollBehavior: 'contain',
  transition: '.1s ease',
  transitionProperty: 'height',
  height: 'min(330px, var(--cmdk-list-height))',
});
