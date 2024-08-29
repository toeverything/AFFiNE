import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const card = style({
  padding: 16,
  borderRadius: 12,
  border: `0.5px solid ${cssVarV2('layer/insideBorder/border')}`,
  boxShadow: '0px 2px 3px rgba(0,0,0,0.05)',
  background: cssVarV2('layer/background/primary'),

  display: 'flex',
  flexDirection: 'column',
  gap: 8,

  color: 'unset',
  ':visited': { color: 'unset' },
  ':hover': { color: 'unset' },
  ':active': { color: 'unset' },
});
export const head = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
});
export const title = style({
  width: 0,
  flex: 1,
  fontSize: 17,
  lineHeight: '22px',
  fontWeight: 600,
  letterSpacing: -0.43,

  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  overflow: 'hidden',
});
export const untitled = style({
  opacity: 0.4,
});
export const content = style({
  fontSize: 13,
  lineHeight: '18px',
  fontWeight: 400,
  letterSpacing: -0.08,
  flex: 1,

  overflow: 'hidden',
});

export const contentEmpty = style({
  opacity: 0.3,
});
