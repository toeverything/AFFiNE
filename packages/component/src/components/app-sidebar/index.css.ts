import { style } from '@vanilla-extract/css';

export const navStyle = style({
  position: 'relative',
  backgroundColor: 'var(--affine-background-secondary-color)',
  width: '256px',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  padding: '0 4px',
  '@media': {
    '(max-width: 600px)': {
      position: 'absolute',
      width: 'calc(10vw + 256px)',
    },
  },
});

export const navHeaderStyle = style({
  flex: '0 0 auto',
  height: '52px',
  padding: '0px 16px 0px 10px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});

export const navBodyStyle = style({
  flex: '1 1 auto',
});

export const navFooterStyle = style({
  flex: '0 0 auto',
  borderTop: '1px solid var(--affine-border-color)',
});

export const sidebarButtonStyle = style({
  width: '32px',
  height: '32px',
  color: 'var(--affine-icon-color)',
});
