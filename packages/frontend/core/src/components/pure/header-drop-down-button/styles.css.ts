import { globalStyle, style } from '@vanilla-extract/css';

export const headerMenuTrigger = style({});

globalStyle(`${headerMenuTrigger} svg`, {
  transition: 'transform 0.15s ease-in-out',
});
globalStyle(`${headerMenuTrigger}:hover svg`, {
  transform: 'translateY(3px)',
});
