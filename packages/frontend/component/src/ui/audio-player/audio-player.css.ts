import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 6,
  padding: 12,
  cursor: 'default',
  width: '100%',
  backgroundColor: cssVarV2('layer/background/primary'),
  gap: 12,
});

export const upper = style({
  display: 'flex',
  alignItems: 'flex-start',
  fontWeight: 500,
  fontSize: '16px',
  color: cssVarV2('text/primary'),
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  lineHeight: '24px',
  gap: 12,
});

export const upperLeft = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  flex: 1,
  overflow: 'hidden',
});

export const upperRight = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
});

export const upperRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
});

export const nameLabel = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  marginRight: 8,
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
});

export const spacer = style({
  flex: 1,
});

export const description = style({
  display: 'flex',
  gap: '8px',
  alignItems: 'center',
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
});

export const audioIcon = style({
  height: 40,
  width: 40,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const controlButton = style({
  height: 40,
  width: 40,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '50%',
  backgroundColor: cssVarV2('layer/background/secondary'),
  color: cssVarV2('icon/primary'),
});

export const controls = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginTop: 8,
});

export const button = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'transparent',
  color: cssVarV2('text/primary'),
  border: 'none',
  borderRadius: 4,
  padding: '4px',
  minWidth: '28px',
  height: '28px',
  fontSize: '14px',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  ':hover': {
    backgroundColor: cssVarV2('layer/background/secondary'),
  },
  ':disabled': {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
});

export const progressContainer = style({
  width: '100%',
  height: 32,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
});

export const progressBar = style({
  width: '100%',
  height: 12,
  backgroundColor: cssVarV2('layer/background/tertiary'),
  borderRadius: 2,
  overflow: 'hidden',
  cursor: 'pointer',
  position: 'relative',
});

export const progressFill = style({
  height: '100%',
  backgroundColor: cssVarV2('icon/fileIconColors/red'),
  transition: 'width 0.1s linear',
});

export const timeDisplay = style({
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
  minWidth: 48,
  ':last-of-type': {
    textAlign: 'right',
  },
});

export const playbackRateDisplay = style({
  fontSize: cssVar('fontXs'),
  fontWeight: 500,
  color: cssVarV2('text/secondary'),
  cursor: 'pointer',
});

export const miniRoot = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 4,
  padding: 8,
  cursor: 'default',
  width: '100%',
  backgroundColor: cssVarV2('layer/background/primary'),
});

export const miniNameLabel = style({
  fontSize: cssVar('fontXs'),
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  lineHeight: '20px',
  marginBottom: 2,
});

export const miniPlayerContainer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 24,
});

export const miniProgressContainer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 24,
});

export const miniCloseButton = style({
  position: 'absolute',
  right: 8,
  top: 8,
  display: 'none',
  background: cssVarV2('layer/background/secondary'),
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  selectors: {
    [`${miniRoot}:hover &`]: {
      display: 'block',
    },
  },
});
