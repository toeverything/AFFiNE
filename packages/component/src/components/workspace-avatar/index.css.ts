import { style } from '@vanilla-extract/css';
export const avatarStyle = style({
  width: '100%',
  height: '100%',
  color: '#fff',
  borderRadius: '50%',
  overflow: 'hidden',
  display: 'inline-block',
  verticalAlign: 'middle',
});

export const avatarImageStyle = style({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  objectPosition: 'center',
});

export const avatarTextStyle = style({
  width: '100%',
  height: '100%',
  border: '1px solid #fff',
  textAlign: 'center',
  color: '#fff',
  borderRadius: '50%',
  display: 'inline-flex',
  lineHeight: '1',
  justifyContent: 'center',
  alignItems: 'center',
  userSelect: 'none',
});
