import { style } from '@vanilla-extract/css';

export const headerCreateNewCollectionIconButton = style({
  padding: '4px 8px',
  fontSize: '16px',
  width: '32px',
  height: '28px',
  borderRadius: '8px',
  transition: 'opacity 0.1s ease-in-out',
});
export const headerCreateNewButtonHidden = style({
  opacity: 0,
  pointerEvents: 'none',
});
