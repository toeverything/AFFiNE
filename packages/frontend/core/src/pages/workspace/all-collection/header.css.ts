import { style } from '@vanilla-extract/css';

export const headerCreateNewCollectionIconButton = style({
  width: '32px',
  height: '32px',
  borderRadius: 8,
  transition: 'all 0.1s ease-in-out',
});
export const headerCreateNewButtonHidden = style({
  opacity: 0,
  pointerEvents: 'none',
});
