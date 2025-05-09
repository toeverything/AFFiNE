import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const root = style({
  width: '100%',
  height: '100%',
  padding: 4,
  display: 'flex',
  gap: 4,
  alignItems: 'center',
  ['WebkitAppRegion' as string]: 'drag',
});

export const affineIcon = style({
  width: 28,
  height: 28,
});

export const recordingIcon = style({
  width: 8,
  height: 8,
  borderRadius: '50%',
  backgroundColor: cssVarV2('layer/pureWhite'),
});

export const text = style({
  fontSize: cssVar('fontSm'),
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontWeight: 600,
  flex: 1,
});

export const controls = style({
  display: 'flex',
  gap: 2,
});
