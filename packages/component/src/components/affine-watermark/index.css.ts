import { style } from '@vanilla-extract/css';

export const waterMarkStyle = style({
  display: 'none',
  '@media': {
    print: {
      position: 'fixed',
      bottom: '0',
      right: '20px',
      zIndex: 100,
      display: 'block',
      width: 'auto',
      filter: 'opacity(20%)',
    },
  },
});

export const linkStyle = style({
  textAlign: 'left',
  color: 'black',
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'flex-end',
  alignItems: 'center',
  width: '200px',
});
export const linkTextStyle = style({
  whiteSpace: 'nowrap',
});
export const iconStyle = style({
  fontSize: '20px',
});
