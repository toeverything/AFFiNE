import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const actionButton = style({});

export const connectDialog = style({
  width: 480,
  maxWidth: `calc(100vw - 32px)`,
});

export const connectTitle = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontWeight: 500,
  fontSize: 15,
  lineHeight: '24px',
  marginBottom: 8,
});

export const connectDesc = style({
  fontSize: 12,
  lineHeight: '20px',
  fontWeight: 400,
  color: cssVarV2.text.secondary,
  marginBottom: 16,
});

export const connectInput = style({
  height: 28,
  borderRadius: 4,
});
export const inputErrorMsg = style({
  fontSize: 10,
  color: cssVarV2.status.error,
  lineHeight: '16px',

  paddingTop: 0,
  height: 0,
  overflow: 'hidden',
  transition: 'all 0.23s ease',
  selectors: {
    '&[data-show="true"]': {
      paddingTop: 4,
      height: 20,
    },
  },
});

export const connectFooter = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 20,
  marginTop: 20,
});

export const getTokenLink = style({
  color: cssVarV2.text.link,
});
