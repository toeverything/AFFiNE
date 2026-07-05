import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const importModalContainer = style({
  width: '100%',
  height: '100%',
  display: 'flex',
  boxSizing: 'border-box',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px 24px',
  gap: '12px',
});

export const importModalTitle = style({
  width: '100%',
  height: 'auto',
  fontSize: cssVar('fontH6'),
  fontWeight: '600',
  lineHeight: cssVar('lineHeight'),
});

export const importModalContent = style({
  width: '100%',
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
});

export const closeButton = style({
  top: '24px',
  right: '24px',
});

export const importModalTip = style({
  width: '100%',
  height: 'auto',
  fontSize: cssVar('fontSm'),
  lineHeight: cssVar('lineHeight'),
  fontWeight: '400',
  color: cssVar('textSecondaryColor'),
});

export const link = style({
  color: cssVar('linkColor'),
  cursor: 'pointer',
});

export const importStatusContent = style({
  width: '100%',
  fontSize: cssVar('fontBase'),
  lineHeight: cssVar('lineHeight'),
  fontWeight: '400',
  color: cssVar('textPrimaryColor'),
});

export const importProgress = style({
  width: '100%',
  fontSize: cssVar('fontSm'),
  lineHeight: cssVar('lineHeight'),
  color: cssVar('textSecondaryColor'),
});

export const importWarnings = style({
  width: '100%',
  maxHeight: '120px',
  overflow: 'auto',
  fontSize: cssVar('fontSm'),
  lineHeight: cssVar('lineHeight'),
  color: cssVar('textSecondaryColor'),
});

export const importErrorDetail = style({
  width: '100%',
  fontSize: cssVar('fontXs'),
  lineHeight: cssVar('lineHeight'),
  color: cssVar('textSecondaryColor'),
  overflowWrap: 'anywhere',
});

export const importModalButtonContainer = style({
  width: '100%',
  display: 'flex',
  flexDirection: 'row',
  gap: '20px',
  justifyContent: 'end',
  marginTop: '20px',
});

export const importItem = style({
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  width: '100%',
  height: 'auto',
  gap: '4px',
  padding: '8px 12px',
  borderRadius: '8px',
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  background: cssVarV2('button/secondary'),
  selectors: {
    '&:hover': {
      background: cssVarV2('layer/background/hoverOverlay'),
      cursor: 'pointer',
      transition: 'background .30s',
    },
  },
});

export const importItemLabel = style({
  display: 'flex',
  alignItems: 'center',
  padding: '0 4px',
  textAlign: 'left',
  flex: 1,
  color: cssVar('textPrimaryColor'),
  fontSize: cssVar('fontBase'),
  lineHeight: cssVar('lineHeight'),
  fontWeight: '500',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
});

export const importItemPrefix = style({
  marginRight: 'auto',
});

export const importItemSuffix = style({
  marginLeft: 'auto',
});
