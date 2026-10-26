import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const container = style({
  height: '100%',
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '12px',
});

export const uploadZone = style({
  width: '100%',
  height: '140px',
  border: `2px dashed ${cssVarV2.layer.insideBorder.border}`,
  borderRadius: '8px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  cursor: 'pointer',
  color: cssVarV2.text.secondary,
  transition: 'border-color 0.2s',
  selectors: {
    '&:hover, &[data-dragging]': {
      borderColor: cssVarV2.button.primary,
      color: cssVarV2.button.primary,
    },
  },
});

export const preview = style({
  width: '80px',
  height: '80px',
  borderRadius: '8px',
  objectFit: 'contain',
  border: `1px solid ${cssVarV2.layer.insideBorder.border}`,
});

export const fileInput = style({
  display: 'none',
});

export const hint = style({
  fontSize: '12px',
  color: cssVarV2.text.secondary,
});

export const error = style({
  fontSize: '12px',
  color: cssVarV2.status.error,
});
