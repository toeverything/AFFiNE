import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const header = style({
  display: 'flex',
  width: '100%',
  height: '100%',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative',
  padding: '0 36px',
});

export const todayButton = style({
  position: 'absolute',
  right: 0,
});

export const body = style({
  width: '100%',
  height: '100%',
  borderTop: `0.5px solid ${cssVarV2.layer.insideBorder.border}`,
  selectors: {
    '&[data-mobile]': {
      borderTop: 'none',
    },
  },
});

export const content = style({
  maxWidth: 944,
  padding: '0px 50px',
  margin: '0 auto',
  selectors: {
    '[data-mobile] &': {
      padding: '0 24px',
    },
  },
});

export const docTitleContainer = style({
  color: cssVarV2.text.primary,
  fontSize: 40,
  lineHeight: '50px',
  fontWeight: 700,
  padding: '38px 0',
});

export const placeholder = style({
  height: 200,
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  border: `1px dashed ${cssVarV2.layer.insideBorder.border}`,
  borderRadius: 8,
});

export const placeholderIcon = style({
  width: 36,
  height: 36,
  borderRadius: 36,
  backgroundColor: cssVarV2.button.emptyIconBackground,
  color: cssVarV2.icon.primary,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 20,
  marginBottom: 4,
});

export const placeholderText = style({
  fontSize: 14,
  lineHeight: '22px',
  marginBottom: 16,
  color: cssVarV2.text.tertiary,
});
