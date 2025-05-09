import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const host = style({});

export const container = style({
  display: 'flex',
  width: '100%',
  height: '40px',
  alignItems: 'center',
  justifyContent: 'space-between',
  boxSizing: 'border-box',
  padding: '8px 16px',
});

export const noteSettingContainer = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

export const label = style({
  width: '119px',
  height: '22px',
  fontSize: '14px',
  fontWeight: 500,
  lineHeight: '22px',
  color: cssVarV2('text/secondary'),
});

export const notePreviewSettingContainer = style({
  display: 'none',
  justifyContent: 'center',
  alignItems: 'center',
  background: cssVarV2('layer/background/overlayPanel'),
  boxShadow: cssVar('shadow2'),
  borderRadius: '8px',
  selectors: {
    '&[data-show]': {
      display: 'flex',
    },
  },
});
