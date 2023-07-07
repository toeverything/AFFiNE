import { style } from '@vanilla-extract/css';

export const tabStyle = style({
  display: 'flex',
  flex: '1',
  width: '100%',
  padding: '0 10px',
  margin: '0',
  justifyContent: 'center',
  alignItems: 'center',
  position: 'relative',
});

export const menuItemStyle = style({
  padding: '4px 18px',
  paddingBottom: '16px',
  width: '100%',
});

export const descriptionStyle = style({
  wordWrap: 'break-word',
  // wordBreak: 'break-all',
  fontSize: '16px',
  marginTop: '16px',
  marginBottom: '16px',
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
