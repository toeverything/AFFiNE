import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const activateModalContent = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  marginTop: '12px',
});

export const tipsContainer = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '8px',
  color: cssVarV2('text/secondary'),
  fontSize: cssVar('fontSm'),
  borderRadius: '8px',
  backgroundColor: cssVarV2('layer/background/tertiary'),
});

export const tipsTitle = style({
  fontWeight: 500,
});

export const tipsContent = style({
  fontSize: cssVar('fontSm'),
});
export const textLink = style({
  color: cssVarV2('text/link'),
  selectors: {
    '&:visited': {
      color: cssVarV2('text/link'),
    },
  },
});

export const workspaceIdContainer = style({
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: cssVar('fontXs'),
  alignItems: 'center',
  '@media': {
    'screen and (max-width: 768px)': {
      flexWrap: 'wrap',
    },
  },
});

export const workspaceIdLabel = style({
  fontWeight: 500,
});

export const copyButton = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  cursor: 'pointer',
  padding: '4px 12px',
  borderRadius: '8px',
  width: '100%',
  maxWidth: '300px',
});
export const copyButtonContent = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
});
export const copyButtonText = style({
  fontSize: cssVar('fontXs'),
  padding: '0 4px',
  color: cssVarV2('text/secondary'),
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '100%',
  flex: 1,
});

export const copyIcon = style({
  width: '16px',
  height: '16px',
  color: cssVarV2('icon/primary'),
});

export const uploadButton = style({
  width: '100%',
});

export const uploadButtonContent = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  justifyContent: 'center',
});

export const uploadButtonIcon = style({
  width: '16px',
  height: '16px',
  color: cssVarV2('layer/pureWhite'),
});

export const footer = style({
  display: 'flex',
  fontSize: cssVar('fontSm'),
  fontWeight: 400,
  color: cssVarV2('text/secondary'),
});
