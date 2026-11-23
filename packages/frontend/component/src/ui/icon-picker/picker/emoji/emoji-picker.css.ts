import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const skinTrigger = style({});

// header skin
export const skinList = style({
  display: 'flex',
  flexDirection: 'row',
  gap: 2,
});
export const skinItem = style({});

// content
export const loadingWrapper = style({
  height: 120,
  flexGrow: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  color: cssVarV2.text.secondary,
});

export const footer = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 16px',
  borderTop: `0.5px solid ${cssVarV2.layer.insideBorder.border}`,
});

export const footerButton = style({});
export const footerButtonActive = style({
  backgroundColor: cssVarV2.layer.background.hoverOverlay,
});
export const footerIcon = style({
  color: cssVarV2.icon.secondary,
});
export const footerIconActive = style({
  color: cssVarV2.icon.primary,
});
