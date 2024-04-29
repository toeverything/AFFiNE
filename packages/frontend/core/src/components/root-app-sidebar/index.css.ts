import { cssVar } from '@toeverything/theme';
import { createVar, globalStyle, style } from '@vanilla-extract/css';

export const progressColorVar = createVar();

export const workspaceAndUserWrapper = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
});

export const workspaceWrapper = style({
  width: 0,
  flex: 1,
});

export const userInfoWrapper = style({
  flexShrink: 0,
  width: 'auto',
  height: 'auto',
  padding: '4px 0',
});

// TODO:
globalStyle(`button.${userInfoWrapper} > span`, {
  lineHeight: 0,
});

export const operationMenu = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

export const cloudUsage = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '4px 12px',
});
export const cloudUsageLabel = style({
  fontWeight: 500,
  lineHeight: '20px',
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
});
export const cloudUsageLabelUsed = style({
  color: progressColorVar,
});

export const cloudUsageBar = style({
  height: 10,
  borderRadius: 5,
  overflow: 'hidden',
  position: 'relative',
  minWidth: 160,

  '::before': {
    position: 'absolute',
    inset: 0,
    content: '""',
    backgroundColor: cssVar('black'),
    opacity: 0.04,
  },
});
export const cloudUsageBarInner = style({
  height: '100%',
  borderRadius: 'inherit',
  backgroundColor: progressColorVar,
});
