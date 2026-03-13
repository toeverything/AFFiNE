import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const ulStyle = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: '8px',
  marginTop: '12px',
});

export const liStyle = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'start',
  fontSize: cssVar('fontBase'),
});

export const prefixDot = style({
  background: cssVarV2('icon/activated'),
  width: '5px',
  height: '5px',
  borderRadius: '50%',
  marginInlineEnd: '12px',
  marginTop: '10px',
});
