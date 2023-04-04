import { style } from '@vanilla-extract/css';
export const avatarStyle = style({
  color: '#fff',
  borderRadius: '50%',
  overflow: 'hidden',
  display: 'inline-block',
  verticalAlign: 'middle',
});

export const avatarTextStyle = style({
  border: '1px solid #fff',
  color: '#fff',
  borderRadius: '50%',
  display: 'inline-flex',
  lineHeight: '1',
  justifyContent: 'center',
  alignItems: 'center',
  userSelect: 'none',
});
