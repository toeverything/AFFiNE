import { globalStyle, style } from '@vanilla-extract/css';

export const pageBlockTitle = style({
  position: 'relative',
});

globalStyle(`${pageBlockTitle} .doc-title-container`, {
  padding: '26px 0px',
  marginInlineStart: 'unset',
  marginInlineEnd: 'unset',
});
