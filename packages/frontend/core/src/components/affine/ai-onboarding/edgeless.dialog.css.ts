import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const thumb = style({
  borderRadius: 'inherit',
  borderBottomLeftRadius: 0,
  borderBottomRightRadius: 0,
  width: '100%',
  height: 211,
  background: cssVar('backgroundOverlayPanelColor'),
  overflow: 'hidden',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
});

export const thumbContent = style({
  borderRadius: 'inherit',
  width: 'calc(100% + 4px)',
  height: 'calc(100% + 4px)',
});

export const getStartedButtonText = style({
  color: cssVar('textSecondaryColor'),
});
export const purchaseButtonText = style({
  color: cssVar('textPrimaryColor'),
});
