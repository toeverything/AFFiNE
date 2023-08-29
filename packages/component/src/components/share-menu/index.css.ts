import { style } from '@vanilla-extract/css';

export const menuItemStyle = style({
  padding: '4px 18px',
  paddingBottom: '16px',
  width: '100%',
});

export const descriptionStyle = style({
  wordWrap: 'break-word',
  // wordBreak: 'break-all',
  fontSize: 'var(--affine-font-xs)',
  lineHeight: '20px',
  color: 'var(--affine-text-secondary-color)',
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
  fontWeight: 600,
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
  padding: '0 4px',
  width: '100%',
  gap: '12px',
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
  minHeight: '108px',
  position: 'relative',
});

export const cloudSvgContainer = style({
  width: '100%',
  height: '100%',
  minWidth: '185px',
});

export const cloudSvgStyle = style({
  width: '193px',
  height: '108px',
  position: 'absolute',
  bottom: '0',
  right: '8px',
});
export const shareIconStyle = style({
  fontSize: '16px',
  color: 'var(--affine-icon-color)',
  display: 'flex',
  alignItems: 'center',
});
