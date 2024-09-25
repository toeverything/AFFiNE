import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { createVar, globalStyle, style } from '@vanilla-extract/css';

const propertyNameCellWidth = createVar();
export const rowHPadding = createVar();
export const fontSize = createVar();

export const root = style({
  display: 'flex',
  width: '100%',
  justifyContent: 'center',
  fontFamily: cssVar('fontSansFamily'),
  vars: {
    [propertyNameCellWidth]: '160px',
    [rowHPadding]: '6px',
    [fontSize]: cssVar('fontSm'),
  },
  '@container': {
    [`viewport (width <= 640px)`]: {
      vars: {
        [rowHPadding]: '0px',
        [fontSize]: cssVar('fontXs'),
      },
    },
  },
});

export const rootCentered = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  width: '100%',
  maxWidth: cssVar('editorWidth'),
  padding: `0 ${cssVar('editorSidePadding', '24px')}`,
  '@container': {
    [`viewport (width <= 640px)`]: {
      padding: '0 16px',
    },
  },
});

export const tableHeader = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
});

export const tableHeaderInfoRow = style({
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  color: cssVarV2('text/secondary'),
  fontSize: fontSize,
  fontWeight: 500,
  minHeight: 34,
  '@media': {
    print: {
      display: 'none',
    },
  },
});

export const tableHeaderSecondaryRow = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  color: cssVar('textPrimaryColor'),
  fontSize: fontSize,
  fontWeight: 500,
  padding: `0 ${rowHPadding}`,
  gap: '8px',
  height: 24,
  '@media': {
    print: {
      display: 'none',
    },
  },
});

export const tableHeaderCollapseButtonWrapper = style({
  display: 'flex',
  flex: 1,
  justifyContent: 'flex-end',
  cursor: 'pointer',
});

export const pageInfoDimmed = style({
  color: cssVarV2('text/secondary'),
});

export const spacer = style({
  flexGrow: 1,
});

export const tableHeaderBacklinksHint = style({
  padding: `0 ${rowHPadding}`,
  cursor: 'pointer',
  borderRadius: '4px',
  ':hover': {
    backgroundColor: cssVarV2('layer/background/hoverOverlay'),
  },
});

export const backlinksList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  fontSize: cssVar('fontSm'),
});

export const tableHeaderTimestamp = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'start',
  gap: '8px',
  cursor: 'default',
  padding: `0 ${rowHPadding}`,
});

export const tableHeaderDivider = style({
  height: 0,
  borderTop: `0.5px solid ${cssVarV2('layer/insideBorder/border')}`,
  width: '100%',
  margin: '8px 0',
  '@media': {
    print: {
      display: 'none',
    },
  },
});

export const tableBodyRoot = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  '@media': {
    print: {
      selectors: {
        '&[data-state="open"]': {
          marginBottom: 32,
        },
      },
    },
  },
});

export const tableBodySortable = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  position: 'relative',
});

export const addPropertyButton = style({
  alignSelf: 'flex-start',
  fontSize: cssVar('fontSm'),
  color: `${cssVarV2('text/secondary')}`,
  padding: '0 4px',
  height: 36,
  fontWeight: 400,
  gap: 6,
  '@media': {
    print: {
      display: 'none',
    },
  },
});
globalStyle(`${addPropertyButton} svg`, {
  fontSize: 16,
  color: cssVarV2('icon/secondary'),
});
globalStyle(`${addPropertyButton}:hover svg`, {
  color: cssVarV2('icon/primary'),
});

export const collapsedIcon = style({
  transition: 'transform 0.2s ease-in-out',
  selectors: {
    '&[data-collapsed="true"]': {
      transform: 'rotate(90deg)',
    },
  },
});

export const propertyRow = style({
  display: 'flex',
  gap: 4,
  minHeight: 32,
  position: 'relative',
  selectors: {
    '&[data-dragging=true]': {
      backgroundColor: cssVarV2('layer/background/hoverOverlay'),
      borderTopLeftRadius: 0,
      borderBottomLeftRadius: 0,
    },
  },
});

export const tagsPropertyRow = style([
  propertyRow,
  {
    marginBottom: -4,
  },
]);

export const draggableItem = style({
  cursor: 'pointer',
  selectors: {
    '&:before': {
      content: '""',
      display: 'block',
      position: 'absolute',
      top: '50%',
      borderRadius: '2px',
      backgroundColor: cssVarV2('text/placeholder'),
      transform: 'translate(-12px, -50%)',
      transition: 'all 0.2s 0.1s',
      opacity: 0,
      height: '4px',
      width: '4px',
      willChange: 'height, opacity',
    },
    '&[data-draggable=false]:before': {
      display: 'none',
    },
    '&:hover:before': {
      height: 12,
      opacity: 1,
    },
    '&:active:before': {
      height: '100%',
      width: '1px',
      borderRadius: 0,
      opacity: 1,
      transform: 'translate(-6px, -50%)',
    },
    '&[data-other-dragging=true]:before': {
      opacity: 0,
    },
    '&[data-other-dragging=true]': {
      pointerEvents: 'none',
    },
  },
});

export const draggableRowSetting = style([
  draggableItem,
  {
    selectors: {
      '&:active:before': {
        height: '100%',
        width: '1px',
        opacity: 1,
        transform: 'translate(-12px, -50%)',
      },
    },
  },
]);

export const propertyRowCell = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'flex-start',
  position: 'relative',
  borderRadius: 4,
  fontSize: cssVar('fontSm'),
  lineHeight: '22px',
  userSelect: 'none',
  padding: `6px ${rowHPadding} 6px 8px`,
  ':focus-visible': {
    outline: 'none',
  },
});

export const editablePropertyRowCell = style([
  propertyRowCell,
  {
    cursor: 'pointer',
    ':hover': {
      backgroundColor: cssVarV2('layer/background/hoverOverlay'),
    },
  },
]);

export const propertyRowNameCell = style([
  propertyRowCell,
  {
    padding: `6px ${rowHPadding}`,
    flexShrink: 0,
    color: cssVarV2('text/secondary'),
    width: propertyNameCellWidth,
    gap: 6,
  },
]);

export const sortablePropertyRowNameCell = style([
  propertyRowNameCell,
  draggableItem,
  editablePropertyRowCell,
]);

export const propertyRowIconContainer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '2px',
  fontSize: 16,
  color: cssVarV2('icon/secondary'),
});

export const propertyRowNameContainer = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  flexGrow: 1,
});

export const propertyRowName = style({
  flexGrow: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: cssVar('fontSm'),
});

export const propertyRowValueCell = style([
  propertyRowCell,
  editablePropertyRowCell,
  {
    border: `1px solid transparent`,
    color: cssVarV2('text/primary'),
    ':focus': {
      backgroundColor: cssVarV2('layer/background/hoverOverlay'),
    },
    '::placeholder': {
      color: cssVarV2('text/placeholder'),
    },
    selectors: {
      '&[data-empty="true"]': {
        color: cssVarV2('text/placeholder'),
      },
      '&[data-readonly=true]': {
        pointerEvents: 'none',
      },
    },
    flex: 1,
  },
]);

export const propertyRowValueTextCell = style([
  propertyRowValueCell,
  {
    padding: 0,
    position: 'relative',
    ':focus-within': {
      border: `1px solid ${cssVar('blue700')}`,
      boxShadow: cssVar('activeShadow'),
    },
  },
]);

export const propertyRowValueUserCell = style([
  propertyRowValueCell,
  {
    border: 'none',
    overflow: 'hidden',
    columnGap: '0.5rem',
    alignItems: 'center',
  },
]);

export const propertyRowValueTextarea = style([
  propertyRowValueCell,
  {
    border: 'none',
    padding: `6px ${rowHPadding} 6px 8px`,
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
]);

export const propertyRowValueTextareaInvisible = style([
  propertyRowValueCell,
  {
    border: 'none',
    padding: `6px ${rowHPadding} 6px 8px`,
    visibility: 'hidden',
    whiteSpace: 'break-spaces',
    wordBreak: 'break-all',
    overflow: 'hidden',
  },
]);

export const propertyRowValueNumberCell = style([
  propertyRowValueTextCell,
  {
    padding: `6px ${rowHPadding} 6px 8px`,
  },
]);

export const menuHeader = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '8px',
  fontSize: cssVar('fontXs'),
  fontWeight: 500,
  color: cssVarV2('text/secondary'),
  padding: '8px 16px',
  minWidth: 200,
  textTransform: 'uppercase',
});

export const menuItemListScrollable = style({});

export const menuItemListScrollbar = style({
  transform: 'translateX(4px)',
});

export const menuItemList = style({
  display: 'flex',
  flexDirection: 'column',
  maxHeight: 200,
  overflow: 'auto',
});

globalStyle(`${menuItemList}[data-radix-scroll-area-viewport] > div`, {
  display: 'table !important',
});

export const menuItemIconContainer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'inherit',
});

export const menuItemName = style({
  flexGrow: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const checkboxProperty = style({
  fontSize: cssVar('fontH5'),
});

globalStyle(
  `${propertyRow}:is([data-dragging=true], [data-other-dragging=true])
    :is(${propertyRowValueCell}, ${propertyRowNameCell})`,
  {
    pointerEvents: 'none',
  }
);

export const propertyRowNamePopupRow = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '8px',
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  color: cssVarV2('text/secondary'),
  padding: '8px 16px',
  minWidth: 260,
});

export const propertySettingRow = style([
  draggableRowSetting,
  {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '8px',
    fontSize: cssVar('fontSm'),
    padding: '0 12px',
    height: 32,
    position: 'relative',
  },
]);

export const propertySettingRowName = style({
  flexGrow: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: 200,
});

export const selectorButton = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  borderRadius: 4,
  gap: 8,
  fontSize: cssVar('fontSm'),
  fontWeight: 400,
  padding: '4px 8px',
  cursor: 'pointer',
  ':hover': {
    backgroundColor: cssVarV2('layer/background/hoverOverlay'),
  },
  selectors: {
    '&[data-required=true]': {
      color: cssVarV2('text/disable'),
      pointerEvents: 'none',
    },
  },
});

export const propertyRowTypeItem = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  fontSize: cssVar('fontSm'),
  padding: '8px 16px',
  minWidth: 260,
});

export const propertyTypeName = style({
  color: cssVarV2('text/secondary'),
  fontSize: cssVar('fontSm'),
  display: 'flex',
  alignItems: 'center',
  gap: 4,
});

export const backLinksMenu = style({
  background: cssVarV2('layer/white'),
  maxWidth: 'calc(var(--affine-editor-width) / 2)',
  width: '100%',
  maxHeight: '30vh',
  overflowY: 'auto',
});
