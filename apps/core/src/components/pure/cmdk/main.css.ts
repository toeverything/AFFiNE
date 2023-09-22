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

  '::placeholder': {
    color: 'var(--affine-text-secondary-color)',
  },
});

export const panelContainer = style({
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
});

export const itemIcon = style({
  fontSize: 20,
  marginRight: 16,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  color: 'var(--affine-icon-secondary)',
});

export const itemLabel = style({
  fontSize: 14,
  lineHeight: '1.5',
  color: 'var(--affine-text-primary-color)',
  flex: 1,
});

export const timestamp = style({
  display: 'flex',
  fontSize: 'var(--affine-font-xs)',
  color: 'var(--affine-text-secondary-color)',
});

export const keybinding = style({
  display: 'flex',
  fontSize: 'var(--affine-font-xs)',
  columnGap: 2,
});

export const keybindingFragment = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 4px',
  borderRadius: 4,
  color: 'var(--affine-text-secondary-color)',
  backgroundColor: 'var(--affine-background-tertiary-color)',
  width: 24,
  height: 20,
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
  height: 'min(330px, calc(var(--cmdk-list-height) + 8px))',
  padding: '0 6px 8px 6px',
});

globalStyle(`${root} [cmdk-list]::-webkit-scrollbar`, {
  width: 8,
  height: 8,
});

globalStyle(`${root} [cmdk-list]::-webkit-scrollbar-thumb`, {
  borderRadius: 4,
  border: '1px solid transparent',
  backgroundClip: 'padding-box',
});

globalStyle(`${root} [cmdk-list]:hover::-webkit-scrollbar-thumb`, {
  backgroundColor: 'var(--affine-divider-color)',
});

globalStyle(`${root} [cmdk-list]:hover::-webkit-scrollbar-thumb:hover`, {
  backgroundColor: 'var(--affine-icon-color)',
});

globalStyle(`${root} [cmdk-item]`, {
  display: 'flex',
  height: 44,
  padding: '0 12px',
  alignItems: 'center',
  cursor: 'default',
  borderRadius: 4,
  userSelect: 'none',
});

globalStyle(`${root} [cmdk-item][data-selected=true]`, {
  background: 'var(--affine-background-secondary-color)',
});

globalStyle(`${root} [cmdk-item][data-selected=true] ${itemIcon}`, {
  color: 'var(--affine-icon-color)',
});
