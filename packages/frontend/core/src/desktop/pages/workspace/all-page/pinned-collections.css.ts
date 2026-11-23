import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const item = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 8px',
  minWidth: '46px',
  lineHeight: '24px',
  fontSize: cssVar('fontBase'),
  color: cssVarV2('text/secondary'),
  borderRadius: 4,
  backgroundColor: 'var(--affine-background-primary-color)',
  cursor: 'pointer',
  userSelect: 'none',
  ':hover': {
    color: cssVarV2('text/primary'),
    backgroundColor: cssVarV2('layer/background/hoverOverlay'),
  },
  selectors: {
    '&[data-active="true"]': {
      color: cssVarV2('text/primary'),
      backgroundColor: cssVarV2('layer/background/secondary'),
    },
  },
});

export const itemContent = style({
  display: 'inline-block',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  textAlign: 'center',
  maxWidth: '128px',
  minWidth: '32px',
});

export const editIconButton = style({});

export const closeButton = style({});

export const container = style({
  display: 'flex',
  flexDirection: 'row',
  gap: 4,
  alignItems: 'center',
});
