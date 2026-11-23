import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const header = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '24px',
});

export const breadcrumb = style({
  fontSize: 14,
  lineHeight: '22px',
  color: cssVarV2.text.secondary,
  display: 'flex',
  alignItems: 'center',
});
export const breadcrumbItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  cursor: 'pointer',
  selectors: {
    '&[data-active="true"]': {
      color: cssVarV2.text.primary,
      cursor: 'default',
    },
  },
});
export const breadcrumbLink = style({
  color: 'inherit',
  textDecoration: 'none',
});
export const breadcrumbIcon = style({
  fontSize: 20,
  color: cssVarV2.icon.primary,
});
export const breadcrumbSeparator = style({
  marginLeft: 4,
  marginRight: 8,
});

export const headerActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: 16,
});

export const tagSelectorTrigger = style({
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  cursor: 'pointer',
  padding: '0px 2px',

  borderRadius: 100,
  border: `1px solid ${cssVarV2.layer.insideBorder.border}`,
});
export const tagSelectorTriggerIcon = style({
  width: 18,
  height: 16,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  ':after': {
    width: 7,
    height: 7,
    borderRadius: '50%',
    content: '',
    display: 'block',
    backgroundColor: 'currentColor',
  },
});
export const tagSelectorTriggerName = style({
  fontSize: 14,
  lineHeight: '22px',
  color: cssVarV2.text.primary,
});
export const tagSelectorTriggerDropdown = style({
  width: 24,
  height: 24,
  fontSize: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: cssVarV2.icon.primary,
});

export const tagSelectorMenuRoot = style({
  padding: 0,
  maxHeight: 400,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
});
export const tagSelectorMenuHeader = style({
  padding: '12px 12px 0 12px',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
});
export const tagSelectorMenuSearchIcon = style({
  fontSize: 16,
  color: cssVarV2.icon.secondary,
});
export const tagSelectorMenuScrollArea = style({
  height: 'fit-content',
  flexGrow: 1,
  flexShrink: 1,
  display: 'flex',
  flexDirection: 'column',
});
export const tagSelectorMenuViewport = style({
  padding: '1px 8px 12px 8px',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  height: 'fit-content',
  flexGrow: 1,
});
export const tagSelectorMenuEmpty = style({
  color: cssVarV2.text.secondary,
  fontSize: 12,
  lineHeight: '20px',
});

export const tagSelectorMenuItem = style({
  padding: 0,
});
export const tagSelectorItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 0px',
});
export const tagSelectorItemIcon = style({
  width: 24,
  height: 24,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  ':after': {
    width: 7,
    height: 7,
    borderRadius: '50%',
    content: '',
    display: 'block',
    backgroundColor: 'currentColor',
  },
});
export const tagSelectorItemText = style({
  fontSize: 14,
  lineHeight: '22px',
  color: cssVarV2.text.primary,
  width: 0,
  flexGrow: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
export const tagSelectorItemCheckedIcon = style({
  fontSize: 16,
  color: cssVarV2.button.primary,
});
