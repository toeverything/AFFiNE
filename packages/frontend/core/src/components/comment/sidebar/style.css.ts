import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const container = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  paddingBottom: '64px',
  position: 'relative',
  minHeight: '100%',
});

export const header = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 16px 0 16px',
  gap: '8px',
  height: '40px',
  position: 'sticky',
  top: 0,
  backgroundColor: cssVarV2('layer/background/primary'),
  zIndex: 2,
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
  padding: 32,
  display: 'flex',
  alignItems: 'center',
  textAlign: 'center',
  lineHeight: '24px',
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
      backgroundColor: cssVarV2('block/comment/highlightUnderline'),
    },
    '&[data-deleted="true"]': {
      textDecoration: 'line-through',
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
    '&[data-editing="true"]': {
      visibility: 'hidden',
    },
  },
});

export const actionButton = style({
  backgroundColor: cssVarV2('button/buttonOverHover'),
});

export const readonlyCommentContainer = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  paddingLeft: '8px',
  position: 'relative',
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
  maxWidth: '800px',
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

export const collapsedReplies = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  cursor: 'pointer',
  height: '28px',
  paddingLeft: '42px',
  borderRadius: 8,
  selectors: {
    '&:hover': {
      backgroundColor: cssVarV2('layer/background/hoverOverlay'),
    },
  },
});

export const collapsedRepliesTitle = style({
  color: cssVarV2('text/emphasis'),
  fontSize: cssVar('fontXs'),
  fontWeight: '500',
});

export const replyItem = style({
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
});

export const replyActions = style({
  display: 'flex',
  opacity: 0,
  gap: '8px',
  position: 'absolute',
  right: 0,
  top: 0,
  pointerEvents: 'none',
  zIndex: 1,
  selectors: {
    [`${replyItem}:hover &`]: {
      opacity: 1,
      pointerEvents: 'auto',
    },
    '&[data-menu-open="true"]': {
      opacity: 1,
    },
    '&[data-editing="true"]': {
      visibility: 'hidden',
    },
  },
});
