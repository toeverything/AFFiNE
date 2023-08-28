import { globalStyle, style } from '@vanilla-extract/css';

export const settingSlideBar = style({
  width: '25%',
  maxWidth: '242px',
  background: 'var(--affine-background-secondary-color)',
  padding: '20px 0px',
  height: '100%',
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
});

export const sidebarTitle = style({
  fontSize: 'var(--affine-font-h-6)',
  fontWeight: '600',
  lineHeight: 'var(--affine-line-height)',
  padding: '0px 16px 0px 24px',
});

export const sidebarSubtitle = style({
  fontSize: 'var(--affine-font-sm)',
  lineHeight: 'var(--affine-line-height)',
  color: 'var(--affine-text-secondary-color)',
  padding: '0px 16px 0px 24px',
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
      overflowY: 'auto',
    },
  },
});

export const sidebarSelectItem = style({
  display: 'flex',
  alignItems: 'center',
  margin: '0px 16px 4px 16px',
  padding: '0px 8px',
  height: '30px',
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
export const currentWorkspaceLabel = style({
  width: '20px',
  height: '20px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  selectors: {
    '&::after': {
      content: '""',
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: 'var(--affine-blue)',
    },
  },
});

export const sidebarFooter = style({ padding: '0 16px' });

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
  border: '1px solid',
  borderColor: 'var(--affine-white)',
  marginRight: '10px',
  flexShrink: 0,
});

globalStyle(`${accountButton} .avatar.not-sign`, {
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  fontSize: '22px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  borderColor: 'var(--affine-border-color)',
  color: 'var(--affine-border-color)',
  background: 'var(--affine-white)',
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
