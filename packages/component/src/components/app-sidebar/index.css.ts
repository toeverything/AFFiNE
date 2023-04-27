import { createVar, style } from '@vanilla-extract/css';

export const navWidthVar = createVar('nav-width');

export const navStyle = style({
  position: 'relative',
  backgroundColor: 'var(--affine-background-secondary-color)',
  width: navWidthVar,
  minWidth: navWidthVar,
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  transition: 'margin-left .3s',
  '@media': {
    '(max-width: 600px)': {
      position: 'absolute',
      width: `calc(10vw + ${navWidthVar})`,
      selectors: {
        '&[data-open="false"]': {
          marginLeft: `calc((10vw + ${navWidthVar}) * -1)`,
        },
      },
    },
  },
  selectors: {
    '&[data-open="false"]': {
      marginLeft: `calc(${navWidthVar} * -1)`,
    },
  },
  vars: {
    [navWidthVar]: '256px',
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
