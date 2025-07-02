import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const container = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  paddingTop: '8px',
  paddingBottom: '64px',
  position: 'relative',
  minHeight: '100%',
});

export const header = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0 16px',
  gap: '8px',
  height: '32px',
});

export const headerTitle = style({
  fontSize: cssVar('fontSm'),
  fontWeight: '500',
  color: cssVarV2('text/secondary'),
});

export const commentList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});

export const empty = style({
  height: '100%',
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: cssVarV2('text/secondary'),
});

export const commentItem = style({
  padding: '12px',
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  ':hover': {
    backgroundColor: cssVarV2('layer/background/hoverOverlay'),
  },
  selectors: {
    '&[data-highlighting="true"]:before': {
      content: '',
      display: 'block',
      width: '2px',
      height: '100%',
      backgroundColor: cssVarV2('layer/insideBorder/primaryBorder'),
      position: 'absolute',
      top: '0',
      left: '0',
    },
    '&[data-highlighting="true"]': {
      backgroundColor: cssVarV2('block/comment/hanelActive'),
    },
    '&[data-resolved="true"]': {
      opacity: 0.5,
    },
  },
});

export const loading = style({
  height: '100%',
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const repliesContainer = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});

export const pendingComment = style({
  padding: '12px',
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  background: cssVarV2('block/comment/hanelActive'),
  selectors: {
    '&:before': {
      content: '',
      display: 'block',
      width: '2px',
      height: '100%',
      backgroundColor: cssVarV2('layer/insideBorder/primaryBorder'),
      position: 'absolute',
      left: '0',
      top: '0',
      bottom: '0',
    },
  },
});

export const previewContainer = style({
  fontSize: cssVar('fontSm'),
  color: cssVarV2('text/secondary'),
  paddingLeft: '10px',
  position: 'relative',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  lineHeight: '22px',
  selectors: {
    '&:before': {
      content: '',
      display: 'block',
      width: '2px',
      height: '100%',
      position: 'absolute',
      left: '0',
      top: '0',
      backgroundColor: cssVarV2('layer/insideBorder/primaryBorder'),
    },
  },
});

export const commentActions = style({
  display: 'flex',
  opacity: 0,
  gap: '8px',
  marginTop: '8px',
  position: 'absolute',
  right: 12,
  top: 4,
  zIndex: 1,
  pointerEvents: 'none',
  selectors: {
    [`${commentItem}:hover &`]: {
      opacity: 1,
      pointerEvents: 'auto',
    },
    '&[data-menu-open="true"]': {
      opacity: 1,
    },
  },
});

export const readonlyCommentContainer = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  paddingLeft: '8px',
});

export const userContainer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  marginTop: '5px',
  gap: 10,
});

export const commentInputContainer = style({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'flex-start',
  gap: '4px',
  paddingLeft: '8px',
});

export const userName = style({
  fontSize: cssVar('fontSm'),
  color: cssVarV2('text/primary'),
  fontWeight: '500',
});

export const time = style({
  fontSize: cssVar('fontSm'),
  color: cssVarV2('text/secondary'),
  fontWeight: '500',
});
