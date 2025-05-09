import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const listContainer = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  borderRadius: '8px',
  background: cssVarV2('layer/background/primary'),
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  overflow: 'hidden',
});

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
});

export const listItem = style({
  display: 'flex',
  padding: '8px 8px 8px 16px',
  height: '60px',
  alignItems: 'center',
  gap: 12,
  ':hover': {
    background: cssVarV2('layer/background/hoverOverlay'),
  },
});

export const listItemLeftLabel = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
});

export const listItemLeftLabelTitle = style({
  flex: 1,
  maxWidth: '250px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: cssVar('fontSm'),
});

export const listItemLeftLabelDesc = style({
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
});

export const listItemRightLabel = style({
  flex: 1,
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
  gap: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  whiteSpace: 'nowrap',
});

export const empty = style({
  paddingTop: '64px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: cssVarV2('text/secondary'),
  fontSize: cssVar('fontSm'),
});

export const pagination = style({
  paddingBottom: '4px',
});
