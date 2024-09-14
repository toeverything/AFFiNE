import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const headerContent = style({
  fontSize: 17,
  fontWeight: 600,
  lineHeight: '22px',
  letterSpacing: -0.43,
  color: cssVarV2('text/primary'),
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  overflow: 'hidden',
});

export const headerIcon = style({
  width: 24,
  height: 24,
  marginRight: 8,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  ':before': {
    content: '""',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'currentColor',
  },
});
