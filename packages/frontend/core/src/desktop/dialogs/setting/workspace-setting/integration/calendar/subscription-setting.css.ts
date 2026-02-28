import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const card = style({
  padding: '8px 16px 12px 16px',
  borderRadius: 8,
  background: cssVarV2.layer.background.primary,
  border: `1px solid ${cssVarV2.layer.insideBorder.border}`,
});
export const divider = style({
  height: 8,
  display: 'flex',
  margin: '4px 0',
  alignItems: 'center',
  justifyContent: 'center',
  ':before': {
    content: '',
    width: '100%',
    height: 0,
    borderTop: `0.5px solid ${cssVarV2.tab.divider.divider}`,
  },
});
export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '7px 0',
});
export const colorPickerTrigger = style({
  width: 24,
  height: 24,
  borderRadius: 4,
  cursor: 'pointer',
  background: cssVarV2.layer.background.overlayPanel,
  border: `1px solid ${cssVarV2.layer.insideBorder.border}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  ':before': {
    content: '',
    width: 11,
    height: 11,
    borderRadius: 11,
    backgroundColor: 'currentColor',
  },
});
export const colorPicker = style({
  display: 'flex',
  gap: 4,
  alignItems: 'center',
});
export const colorPickerItem = style({
  width: 20,
  height: 20,
  borderRadius: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  selectors: {
    '&[data-active="true"]': {
      boxShadow: `0 0 0 1px ${cssVarV2.button.primary}`,
    },
    '&:before': {
      content: '',
      width: 16,
      height: 16,
      borderRadius: 8,
      background: 'currentColor',
    },
  },
});
export const name = style({
  fontSize: 14,
  fontWeight: 500,
  lineHeight: '22px',
  color: cssVarV2.text.primary,
  width: 0,
  flexGrow: 1,
  textOverflow: 'ellipsis',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  padding: '0px 4px',
  display: 'inline-flex',
  alignItems: 'center',
});

export const allDayEventsContainer = style({
  overflow: 'hidden',
  display: 'grid',
  gridTemplateRows: '1fr',
  transition:
    'grid-template-rows 0.4s cubic-bezier(.07,.83,.46,1), opacity 0.4s ease',
  selectors: {
    '&[data-collapsed="true"]': {
      gridTemplateRows: '0fr',
      opacity: 0,
    },
  },
});

export const allDayEventsContent = style({
  overflow: 'hidden',
});
