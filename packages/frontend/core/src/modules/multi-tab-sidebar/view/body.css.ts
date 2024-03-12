import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const root = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  width: '100%',
  height: '100%',
  minWidth: '320px',
  overflow: 'hidden',
  alignItems: 'center',
  borderTop: `1px solid ${cssVar('borderColor')}`,
});
