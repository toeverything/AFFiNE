import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { createVar, style } from '@vanilla-extract/css';

export const progressColorVar = createVar();

export const operationMenu = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
});

export const account = style({
  padding: '4px 12px',
  userSelect: 'none',
  display: 'flex',
  gap: '12px',
  justifyContent: 'space-between',
  alignItems: 'center',
});
export const content = style({
  flexGrow: 1,
  minWidth: 0,
  maxWidth: '220px',
});
export const name = style({
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  height: '22px',
});
export const email = style({
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flexGrow: 1,
  height: '20px',
});
export const usageBlock = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  borderRadius: 4,
});
export const aiUsageBlock = style({
  padding: '0px 6px 12px',
  cursor: 'pointer',
});
export const cloudUsageBlock = style({
  padding: '0px 6px 12px',
});

export const usageLabel = style({
  fontWeight: 400,
  lineHeight: '20px',
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});
export const usageLabelTitle = style({
  color: cssVarV2('text/primary'),
  marginRight: '0.5em',
});

export const cloudUsageBar = style({
  height: 10,
  borderRadius: 5,
  overflow: 'hidden',
  position: 'relative',
  minWidth: 260,

  '::before': {
    position: 'absolute',
    inset: 0,
    content: '""',
    backgroundColor: cssVarV2('layer/background/hoverOverlay'),
  },
});
export const cloudUsageBarInner = style({
  height: '100%',
  borderRadius: 'inherit',
  backgroundColor: progressColorVar,
});
export const freeTag = style({
  height: 16,
  padding: '0px 4px',
  borderRadius: 2,
  fontWeight: 400,
  fontSize: '10px',
  lineHeight: '16px',
  color: cssVarV2('button/pureWhiteText'),
  background: cssVarV2('badge/free'),
});

export const teamWorkspace = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  borderRadius: 4,
  cursor: 'pointer',
  padding: '2px 6px',
  ':hover': {
    backgroundColor: cssVarV2('layer/background/hoverOverlay'),
  },
});

export const teamAvatarStack = style({
  display: 'flex',
  alignItems: 'center',
});

export const workspaceAvatar = style({
  borderRadius: 4,
  border: `1px solid ${cssVarV2('layer/white')}`,
  selectors: {
    '&.multi-avatar': {
      marginLeft: -4,
    },
  },
});

export const teamName = style({
  flex: 1,
  overflow: 'hidden',
  fontSize: cssVar('fontXs'),
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '170px',
  lineHeight: '20px',
});

export const teamBadge = style({
  marginLeft: 'auto',
  marginRight: '0px',
  padding: '0px 4px',
  borderRadius: '2px',
  fontSize: '10px',
  color: cssVarV2('button/pureWhiteText'),
  background: cssVarV2('badge/believer'),
  height: '16px',
  lineHeight: '16px',
});
