// import { styled } from '@affine/component';
// import { FlexWrapper } from '@affine/component';

import { globalStyle, style, styleVariants } from '@vanilla-extract/css';

export const container = style({
  display: 'flex',
  flexDirection: 'column',
  padding: '52px 52px 0 52px',
  height: 'calc(100vh - 52px)',
});

export const sidebar = style({
  marginTop: '52px',
});

export const content = style({
  overflow: 'auto',
  flex: 1,
  marginTop: '40px',
});

const baseAvatar = style({
  position: 'relative',
  marginRight: '20px',
  cursor: 'pointer',
});

globalStyle(`${baseAvatar} .camera-icon`, {
  position: 'absolute',
  top: 0,
  left: 0,
  display: 'none',
  width: '100%',
  height: '100%',
  borderRadius: '50%',
  backgroundColor: 'rgba(60, 61, 63, 0.5)',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 10,
});

globalStyle(`${baseAvatar}:hover .camera-icon`, {
  display: 'flex',
});

export const avatar = styleVariants({
  disabled: [
    baseAvatar,
    {
      cursor: 'default',
    },
  ],
  enabled: [
    baseAvatar,
    {
      cursor: 'pointer',
    },
  ],
});

const baseTagItem = style({
  display: 'flex',
  margin: '0 48px 0 0',
  height: '34px',
  fontWeight: '500',
  fontSize: 'var(--affine-font-h6)',
  lineHeight: 'var(--affine-line-height)',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
});

export const tagItem = styleVariants({
  active: [
    baseTagItem,
    {
      color: 'var(--affine-primary-color)',
    },
  ],
  inactive: [
    baseTagItem,
    {
      color: 'var(--affine-text-secondary-color)',
    },
  ],
});

export const settingKey = style({
  width: '140px',
  fontSize: 'var(--affine-font-base)',
  fontWeight: 500,
  marginRight: '56px',
  flexShrink: 0,
});

export const settingItemLabel = style({
  fontSize: 'var(--affine-font-base)',
  fontWeight: 600,
  flexShrink: 0,
});

export const settingItemLabelHint = style({
  fontSize: 'var(--affine-font-sm)',
  color: 'var(--affine-text-secondary-color)',
  fontWeight: 400,
  flexShrink: 0,
  marginTop: '4px',
});

export const row = style({
  padding: '40px 0',
  display: 'flex',
  gap: '60px',
  selectors: {
    '&': {
      borderBottom: '1px solid var(--affine-border-color)',
    },
    '&:first-child': {
      paddingTop: 0,
    },
  },
});

export const col = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  flexShrink: 0,
  selectors: {
    [`${row} &:nth-child(1)`]: {
      flex: 3,
    },
    [`${row} &:nth-child(2)`]: {
      flex: 5,
    },
    [`${row} &:nth-child(3)`]: {
      flex: 2,
      alignItems: 'flex-end',
    },
  },
});

export const workspaceName = style({
  fontWeight: '400',
  fontSize: 'var(--affine-font-h6)',
});

export const indicator = style({
  height: '2px',
  background: 'var(--affine-primary-color)',
  position: 'absolute',
  left: '0',
  bottom: '0',
  transition: 'left .3s, width .3s',
});

export const tabButtonWrapper = style({
  display: 'flex',
  position: 'relative',
});

export const storageTypeWrapper = style({
  width: '100%',
  display: 'flex',
  alignItems: 'flex-start',
  padding: '12px',
  borderRadius: '10px',
  gap: '12px',
  boxShadow: 'var(--affine-shadow-1)',
  cursor: 'pointer',
  selectors: {
    '&:hover': {
      boxShadow: 'var(--affine-shadow-2)',
    },
    '&:not(:last-child)': {
      marginBottom: '12px',
    },
  },
});

export const storageTypeLabelWrapper = style({
  flex: 1,
});

export const storageTypeLabel = style({
  fontSize: 'var(--affine-font-base)',
});

export const storageTypeLabelHint = style({
  fontSize: 'var(--affine-font-sm)',
  color: 'var(--affine-text-secondary-color)',
});
