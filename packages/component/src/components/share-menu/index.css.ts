import { style } from '@vanilla-extract/css';

export const tabStyle = style({
  display: 'flex',
  justifyContent: 'space-around',
  alignItems: 'center',
  position: 'relative',
  marginTop: '4px',
  marginLeft: '10px',
  marginRight: '10px',
});

export const menuItemStyle = style({
  marginLeft: '20px',
  marginRight: '20px',
  marginTop: '30px',
});

export const descriptionStyle = style({
  fontSize: '1rem',
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
