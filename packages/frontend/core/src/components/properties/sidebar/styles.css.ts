import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const container = style({
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  paddingTop: '8px',
  paddingBottom: '64px',
  position: 'relative',
});

export const manager = style({
  padding: '0 8px',
});

export const divider = style({
  padding: '0 8px',
});

export const AddListContainer = style({
  padding: '0 8px',
});

export const itemContainer = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '4px 8px',
  gap: '8px',
  color: cssVarV2('text/secondary'),
  borderRadius: '6px',
  lineHeight: '22px',
  position: 'relative',
  userSelect: 'none',
  selectors: {
    '&': {
      cursor: 'pointer',
    },
    '&:hover': {
      backgroundColor: cssVarV2('layer/background/hoverOverlay'),
    },
    '&[data-disabled="true"]': {
      opacity: 0.5,
      pointerEvents: 'none',
    },
  },
});

export const itemIcon = style({
  fontSize: '16px',
});

export const itemName = style({
  flex: 1,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  fontSize: cssVar('fontSm'),
  color: cssVarV2('text/primary'),
});

export const itemAdded = style({
  fontSize: cssVar('fontXs'),
});

export const itemAdd = style({
  color: cssVarV2('text/secondary'),
});
