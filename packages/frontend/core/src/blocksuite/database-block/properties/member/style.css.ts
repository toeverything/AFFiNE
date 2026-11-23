import { style } from '@vanilla-extract/css';

export const memberPopoverContainer = style({
  padding: '8px',
  width: '100%',
  maxWidth: '415px',
  boxSizing: 'border-box',
});

export const memberPopoverContent = style({
  padding: '0',
});

export const searchInput = style({
  width: '100%',
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

export const memberPreviewContainer = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  overflow: 'hidden',
});
