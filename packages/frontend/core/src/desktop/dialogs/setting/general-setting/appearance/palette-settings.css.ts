import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const wrapper = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
});

export const headerActions = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
});

export const buttonGroup = style({
  display: 'flex',
  gap: 8,
});

export const paletteCard = style({
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 10,
  padding: 12,
  background: cssVarV2('layer/background/primary'),
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
});

export const paletteCardDragging = style({
  opacity: 0.6,
});

export const paletteHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
});

export const paletteTitleArea = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minWidth: 0,
});

export const dragHandle = style({
  cursor: 'grab',
  color: cssVarV2('text/secondary'),
  userSelect: 'none',
});

export const defaultBadge = style({
  fontSize: 11,
  borderRadius: 999,
  padding: '2px 8px',
  color: cssVarV2('text/emphasis'),
  background: cssVarV2('layer/background/secondary'),
});

export const paletteNameInput = style({
  height: 26,
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 6,
  padding: '0 8px',
  background: cssVarV2('layer/background/primary'),
  color: cssVarV2('text/primary'),
  minWidth: 140,
});

export const paletteNameText = style({
  fontWeight: 600,
  color: cssVarV2('text/primary'),
});

export const visibilityRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  flexWrap: 'wrap',
});

export const visibilityItem = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  color: cssVarV2('text/secondary'),
  fontSize: 13,
});

export const swatchRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
});

export const swatchButton = style({
  width: 22,
  height: 22,
  borderRadius: '50%',
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  cursor: 'pointer',
  outline: 'none',
});

export const swatchMenu = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 4,
});

export const swatchField = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  fontSize: 12,
  color: cssVarV2('text/secondary'),
});

export const swatchHint = style({
  fontSize: 12,
  color: cssVarV2('text/secondary'),
});

export const swatchInput = style({
  width: 84,
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 6,
  height: 26,
  padding: '0 6px',
  background: cssVarV2('layer/background/primary'),
  color: cssVarV2('text/primary'),
});

export const swatchSelect = style({
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 6,
  height: 26,
  padding: '0 6px',
  background: cssVarV2('layer/background/primary'),
  color: cssVarV2('text/primary'),
});
