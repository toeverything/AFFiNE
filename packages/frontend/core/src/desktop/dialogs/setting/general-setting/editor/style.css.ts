import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';
export const settingWrapper = style({
  flexGrow: 1,
  display: 'flex',
  justifyContent: 'flex-end',
  minWidth: '150px',
  maxWidth: '250px',
});
export const preViewLabelWrapper = style({
  flexGrow: 1,
  display: 'flex',
  justifyContent: 'flex-end',
  minWidth: '100px',
  maxWidth: '250px',
});

export const menu = style({
  background: 'white',
  width: '250px',
  maxHeight: '30vh',
  overflowY: 'auto',
});

export const menuTrigger = style({
  textTransform: 'capitalize',
  fontWeight: 600,
  width: '250px',
});

export const snapshotContainer = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  marginBottom: '24px',
});

export const snapshotTitle = style({
  marginBottom: '8px',
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  color: cssVarV2('text/secondary'),
});

export const snapshotSkeleton = style({
  position: 'absolute',
  top: 0,
  left: 0,
});

export const snapshot = style({
  width: '100%',
  height: '180px',
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: '4px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
});

export const snapshotLabel = style({
  position: 'absolute',
  bottom: '12px',
  left: '50%',
  transform: 'translateX(-50%)',
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
  backgroundColor: cssVarV2('layer/background/hoverOverlay'),
  padding: '2px 8px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '4px',
  zIndex: 1,
  height: '24px',
});

export const editorWrapper = style({
  position: 'relative',
  pointerEvents: 'none',
  userSelect: 'none',
  overflow: 'hidden',
});

export const shapeIndicator = style({
  boxShadow: 'none',
  backgroundColor: cssVarV2('layer/background/tertiary'),
});
export const InputContainer = style({
  display: 'flex',
  alignItems: 'center',
  padding: '4px',
  width: '100%',
  justifyContent: 'flex-start',
  gap: '6px',
});
export const searchInput = style({
  flexGrow: 1,
  border: 'none',
  outline: 'none',
  fontSize: cssVar('fontSm'),
  fontFamily: 'inherit',
  color: 'inherit',
  backgroundColor: 'transparent',
  '::placeholder': {
    color: cssVarV2('text/placeholder'),
  },
});
export const searchIcon = style({
  color: cssVarV2('icon/primary'),
  fontSize: '20px',
});
export const fontItemContainer = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  overflow: 'hidden',
  width: '100%',
});
export const fontItem = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
});
export const fontLabel = style({
  display: 'inline-flex',
  alignItems: 'center',
  color: cssVarV2('text/primary'),
  width: '100%',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  overflow: 'hidden',
  fontSize: cssVar('fontSm'),
  lineHeight: 'normal',
  height: '22px',
  selectors: {
    '&.secondary': {
      color: cssVarV2('text/secondary'),
      fontSize: cssVar('fontXs'),
      height: '20px',
    },
  },
});
export const selectedIcon = style({
  color: cssVarV2('button/primary'),
  marginLeft: '8px',
});
export const notFound = style({
  color: cssVarV2('text/secondary'),
  fontSize: cssVar('fontXs'),
  padding: '4px',
});

export const spellCheckSettingDescription = style({
  color: cssVarV2('toast/iconState/error'),
});

export const spellCheckSettingDescriptionButton = style({
  color: cssVarV2('text/link'),
  fontSize: 'inherit',
});

export const fontSizeContainer = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  width: '250px',
});

export const fontSizeSlider = style({
  flex: 1,
});

export const fontSizeValue = style({
  fontSize: cssVar('fontSm'),
  color: cssVarV2('text/secondary'),
  minWidth: '40px',
  textAlign: 'right',
});
