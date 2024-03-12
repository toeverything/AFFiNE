import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const header = style({
  display: 'flex',
  height: '52px',
  width: '100%',
  alignItems: 'center',
  flexShrink: 0,
  background: cssVar('backgroundPrimaryColor'),
  borderBottom: `1px solid ${cssVar('borderColor')}`,
  padding: '0 16px',
});

export const spacer = style({
  flexGrow: 1,
  minWidth: 12,
});
