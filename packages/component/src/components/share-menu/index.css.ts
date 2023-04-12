import { style } from '@vanilla-extract/css';

export const tabStyle = style({
  display: 'flex',
  flex: '1',
  width: '100%',
  padding: '0',
  margin: '0',
  justifyContent: 'center',
  alignItems: 'center',
  position: 'relative',
});

export const menuItemStyle = style({
  marginLeft: '20px',
  marginRight: '20px',
  marginTop: '22px',
});

export const descriptionStyle = style({
  fontSize: '1rem',
  wordWrap: 'break-word',
  whiteSpace: 'pre-wrap',
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
  alignItems: 'start',
});

export const containerStyle = style({
  display: 'flex',
  width: '100%',
  flexDirection: 'column',
});
export const indicatorContainerStyle = style({
  position: 'relative',
});
