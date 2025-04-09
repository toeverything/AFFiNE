import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const dropEffect = style({
  zIndex: 99999,
  position: 'fixed',
  left: '10px',
  top: '-20px',
  background: cssVar('--affine-background-primary-color'),
  boxShadow: cssVar('--affine-toolbar-shadow'),
  padding: '0px 4px',
  fontSize: '12px',
  borderRadius: '4px',
  lineHeight: 1.4,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  gap: '4px',
});

export const icon = style({
  width: '12px',
  height: '12px',
});
