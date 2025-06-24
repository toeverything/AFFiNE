import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const container = style({
  display: 'flex',
  flexDirection: 'column',
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
    '&[data-drag-preview="true"]': {
      border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
      backgroundColor: 'transparent',
    },
    '&[data-dragging="true"]': {
      opacity: 0.5,
    },
    '&[draggable="true"]:before': {
      content: '""',
      display: 'block',
      position: 'absolute',
      cursor: 'grab',
      top: '50%',
      left: 0,
      borderRadius: '2px',
      backgroundColor: cssVarV2('text/placeholder'),
      transform: 'translate(-6px, -50%)',
      transition: 'height 0.2s 0.1s, opacity 0.2s 0.1s',
      opacity: 0,
      height: '4px',
      width: '4px',
      willChange: 'height, opacity',
    },
    '&[draggable="true"]:after': {
      content: '""',
      display: 'block',
      position: 'absolute',
      cursor: 'grab',
      top: '50%',
      left: 0,
      borderRadius: '2px',
      backgroundColor: 'transparent',
      transform: 'translate(-8px, -50%)',
      height: '100%',
      width: '8px',
      willChange: 'height, opacity',
    },
    '&[draggable="true"]:hover:before': {
      height: 12,
      opacity: 1,
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

export const itemVisibility = style({
  fontSize: cssVar('fontXs'),
});

export const itemMore = style({
  color: cssVarV2('text/secondary'),
});
