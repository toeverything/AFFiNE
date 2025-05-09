import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { globalStyle, style } from '@vanilla-extract/css';

export const propertyRoot = style({
  display: 'flex',
  gap: 4,
  minHeight: 30,
  position: 'relative',
  flexWrap: 'wrap',
  selectors: {
    '&[draggable="true"]': {
      cursor: 'grab',
    },
    '&[draggable="true"][data-dragging="true"]': {
      visibility: 'hidden',
    },
    '&[draggable="true"]:before': {
      content: '""',
      display: 'block',
      position: 'absolute',
      cursor: 'grab',
      top: 15,
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
      top: 15,
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
export const propertyTableContent = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
});

export const hide = style({
  // Visually hide the property while maintaining its position in the layout.
  // This ensures that any open menu remains in the same position when the property is hidden.
  overflow: 'hidden',
  height: '0px',
  minHeight: '0px',
  padding: '0px',
  visibility: 'hidden',
  pointerEvents: 'none',
  position: 'absolute',
});

export const propertyNameContainer = style({
  display: 'flex',
  alignSelf: 'flex-start',
  flexDirection: 'column',
  justifyContent: 'start',
  position: 'relative',
  borderRadius: 4,
  fontSize: cssVar('fontSm'),
  padding: `4px`,
  flexShrink: 0,
  lineHeight: '22px',
  userSelect: 'none',
  color: cssVarV2.text.tertiary,
  width: '160px',
  height: 30,
  selectors: {
    '&[data-has-menu="true"]': {
      cursor: 'pointer',
    },
    '&[data-has-menu="true"]:hover': {
      backgroundColor: cssVarV2('layer/background/hoverOverlay'),
    },
  },
});
globalStyle(`[data-drag-preview] ${propertyNameContainer}:hover`, {
  backgroundColor: 'transparent',
});

export const propertyNameInnerContainer = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
});

export const propertyIconContainer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '2px',
  fontSize: 16,
  color: cssVarV2('icon/secondary'),
});

export const propertyNameContent = style({
  flexGrow: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: cssVar('fontSm'),
});

export const propertyValueContainer = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'flex-start',
  position: 'relative',
  borderRadius: 4,
  fontSize: cssVar('fontSm'),
  lineHeight: '22px',
  padding: `4px`,
  flex: 1,
  ':focus-visible': {
    outline: 'none',
  },
  '::placeholder': {
    color: cssVarV2('text/placeholder'),
  },
  selectors: {
    '&[data-readonly="false"][data-hoverable="true"]': {
      cursor: 'pointer',
    },
    '&[data-readonly="true"][data-hoverable="true"]': {
      cursor: 'default',
    },
    '&[data-hoverable="true"]:is(:hover, :focus-within)': {
      backgroundColor: cssVarV2('layer/background/hoverOverlay'),
    },
  },
});

export const tableButton = style({
  alignSelf: 'flex-start',
  fontSize: cssVar('fontSm'),
  color: `${cssVarV2.text.tertiary}`,
  padding: '0 8px 0px 4px',
  height: 30,
  fontWeight: 400,
  gap: 6,
  '@media': {
    print: {
      display: 'none',
    },
  },
});
globalStyle(`${tableButton} svg`, {
  fontSize: 16,
  color: cssVarV2('icon/secondary'),
});
globalStyle(`${tableButton}:hover svg`, {
  color: cssVarV2('icon/primary'),
});

export const section = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
});

export const sectionHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: 20,
  padding: '4px',
  minHeight: 30,
});

export const sectionHeaderTrigger = style({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flex: 1,
  overflow: 'hidden',
});

export const sectionHeaderIcon = style({
  width: 16,
  height: 16,
  fontSize: 16,
  color: cssVarV2('icon/primary'),
});

export const sectionHeaderName = style({
  display: 'flex',
  alignItems: 'center',
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  selectors: {
    '&[data-collapsed="true"]': {
      color: cssVarV2('text/secondary'),
    },
  },
});

export const sectionCollapsedIcon = style({
  transition: 'all 0.2s ease-in-out',
  color: cssVarV2('icon/primary'),
  fontSize: 20,
  selectors: {
    '&[data-collapsed="true"]': {
      transform: 'rotate(90deg)',
      color: cssVarV2('icon/secondary'),
    },
  },
});

export const sectionContent = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  selectors: {
    '&[hidden]': {
      display: 'none',
    },
  },
});
