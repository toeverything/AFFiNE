import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const memberPopoverContainer = style({
  padding: '8px 0 0 0',
  width: '415px',
});

export const memberPopoverContent = style({
  padding: '0',
});

export const searchContainer = style({
  padding: '12px 12px 8px 12px',
});

export const searchInput = style({
  width: '100%',
});

export const memberListContainer = style({
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '300px',
  overflow: 'auto',
});

export const memberItem = style({
  display: 'flex',
  justifyContent: 'space-between',
  padding: '8px 12px',
  gap: '8px',
  overflow: 'hidden',
  cursor: 'pointer',
  borderRadius: '4px',
  transition: 'background-color 0.2s ease',
  ':hover': {
    backgroundColor: cssVarV2.layer.background.hoverOverlay,
  },
  ':active': {
    backgroundColor: cssVarV2.layer.background.secondary,
  },
});

export const memberItemContent = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  overflow: 'hidden',
});

export const memberName = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '14px',
  lineHeight: '22px',
});

export const cellContainer = style({
  width: '100%',
  position: 'relative',
  gap: '6px',
  display: 'flex',
  flexWrap: 'wrap',
  overflow: 'hidden',
});

export const avatar = style({
  flexShrink: 0,
});

export const loadingContainer = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '16px',
});

export const noResultContainer = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '16px',
  color: cssVarV2.text.secondary,
});

export const memberPreviewContainer = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  overflow: 'hidden',
});
