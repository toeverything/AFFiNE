import { globalStyle, style } from '@vanilla-extract/css';

export const headerStyle = style({
  display: 'flex',
  alignItems: 'center',
  fontSize: 'var(--affine-font-sm)',
  fontWeight: 600,
  lineHeight: '22px',
  padding: '0 4px',
  gap: '4px',
});

export const menuStyle = style({
  width: '410px',
  height: 'auto',
  padding: '12px',
  transform: 'translateX(-10px)',
});

export const menuItemStyle = style({
  padding: '4px',
  transition: 'all 0.3s',
});

export const descriptionStyle = style({
  wordWrap: 'break-word',
  // wordBreak: 'break-all',
  fontSize: 'var(--affine-font-xs)',
  lineHeight: '20px',
  color: 'var(--affine-text-secondary-color)',
  textAlign: 'left',
  padding: '0 6px',
});

export const buttonStyle = style({
  marginTop: '18px',
  // todo: new color scheme should be used
});

export const actionsStyle = style({
  display: 'flex',
  gap: '9px',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'flex-start',
});

export const containerStyle = style({
  display: 'flex',
  width: '100%',
  flexDirection: 'column',
  gap: '8px',
});

export const indicatorContainerStyle = style({
  position: 'relative',
});

export const inputButtonRowStyle = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  marginTop: '16px',
});

export const titleContainerStyle = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: 'var(--affine-font-sm)',
  fontWeight: 500,
  lineHeight: '22px',
  padding: '0 4px',
});

export const subTitleStyle = style({
  fontSize: 'var(--affine-font-sm)',
  fontWeight: 500,
  lineHeight: '22px',
});

export const columnContainerStyle = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  width: '100%',
  gap: '8px',
});

export const rowContainerStyle = style({
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px',
  padding: '4px',
});

export const radioButtonGroup = style({
  display: 'flex',
  justifyContent: 'flex-end',
  padding: '2px',
  minWidth: '154px',
  maxWidth: '250px',
});

export const radioButton = style({
  color: 'var(--affine-text-secondary-color)',
  selectors: {
    '&[data-state="checked"]': {
      color: 'var(--affine-text-primary-color)',
    },
  },
});
export const spanStyle = style({
  padding: '4px 20px',
});

export const disableSharePage = style({
  color: 'var(--affine-error-color)',
});

export const localSharePage = style({
  padding: '12px 8px',
  display: 'flex',
  alignItems: 'center',
  borderRadius: '8px',
  backgroundColor: 'var(--affine-background-secondary-color)',
  minHeight: '84px',
  position: 'relative',
});

export const cloudSvgContainer = style({
  width: '146px',
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
  position: 'absolute',
  bottom: '0',
  right: '0',
});
export const shareIconStyle = style({
  fontSize: '16px',
  color: 'var(--affine-icon-color)',
  display: 'flex',
  alignItems: 'center',
});

export const shareLinkStyle = style({
  padding: '4px',
  fontSize: 'var(--affine-font-xs)',
  fontWeight: 500,
  lineHeight: '20px',
  transform: 'translateX(-4px)',
  gap: '4px',
});
globalStyle(`${shareLinkStyle} > span`, {
  color: 'var(--affine-link-color)',
});
globalStyle(`${shareLinkStyle} > div > svg`, {
  color: 'var(--affine-link-color)',
});
