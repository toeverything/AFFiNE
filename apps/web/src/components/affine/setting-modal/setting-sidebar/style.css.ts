import { globalStyle, style } from '@vanilla-extract/css';

export const settingSlideBar = style({
  width: '25%',
  maxWidth: '242px',
  // TODO: use color variable
  // background: 'var(--affine-background-secondary-color)',
  backgroundColor: '#F4F4F5',
  padding: '20px 16px',
  height: '100%',
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
});

export const sidebarTitle = style({
  fontSize: 'var(--affine-font-h-6)',
  fontWeight: '600',
  lineHeight: 'var(--affine-line-height)',
  paddingLeft: '8px',
});

export const sidebarSubtitle = style({
  fontSize: 'var(--affine-font-sm)',
  lineHeight: 'var(--affine-line-height)',
  color: 'var(--affine-text-secondary-color)',
  paddingLeft: '8px',
  marginTop: '20px',
  marginBottom: '4px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});

export const sidebarItemsWrapper = style({
  selectors: {
    '&.scroll': {
      flexGrow: 1,
    },
  },
});

export const sidebarSelectItem = style({
  display: 'flex',
  alignItems: 'center',
  padding: '0 8px',
  height: '30px',
  marginBottom: '4px',
  fontSize: 'var(--affine-font-sm)',
  borderRadius: '8px',
  cursor: 'pointer',
  userSelect: 'none',
  ':hover': {
    background: 'var(--affine-hover-color)',
  },
  selectors: {
    '&.active': {
      background: 'var(--affine-hover-color)',
    },
    [`${sidebarItemsWrapper} &:last-of-type`]: {
      marginBottom: 0,
    },
  },
});

globalStyle(`${settingSlideBar} .icon`, {
  width: '16px',
  height: '16px',
  marginRight: '10px',
  flexShrink: 0,
});
globalStyle(`${settingSlideBar} .setting-name`, {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flexGrow: 1,
});
globalStyle(`${settingSlideBar} .current-label`, {
  height: '20px',
  borderRadius: '8px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '0 5px',
  // TODO: use color variable
  background: '#1E96EB',
  fontSize: 'var(--affine-font-xs)',
  fontWeight: '600',
  color: 'var(--affine-white)',
  marginLeft: '10px',
  flexShrink: 0,
});

export const accountButton = style({
  height: '42px',
  padding: '4px 8px',
  borderRadius: '8px',
  cursor: 'pointer',
  userSelect: 'none',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  ':hover': {
    background: 'var(--affine-hover-color)',
  },
});

globalStyle(`${accountButton} .avatar`, {
  width: '28px',
  height: '28px',
  border: '1px solid',
  borderColor: 'var(--affine-white)',
  borderRadius: '14px',
  flexShrink: '0',
  marginRight: '10px',
  background: 'red',
});
globalStyle(`${accountButton} .content`, {
  flexGrow: '1',
  minWidth: 0,
});
globalStyle(`${accountButton} .name`, {
  fontSize: 'var(--affine-font-sm)',
  fontWeight: 600,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flexGrow: 1,
});
globalStyle(`${accountButton} .email`, {
  fontSize: 'var(--affine-font-xs)',
  color: 'var(--affine-text-secondary-color)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flexGrow: 1,
});
