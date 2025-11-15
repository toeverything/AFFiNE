import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

// export const root = style({
//   display: 'flex',
//   gap: 8,
//   justifyContent: 'flex-end',
//   minWidth: 0,
//   flexGrow: 1,
//   flexShrink: 0,
// });
export const stackContainer = style({
  display: 'flex',
  gap: 8,
  flexShrink: 1.5,
  minWidth: 0,
  justifyContent: 'flex-end',
});
export const stackProperties = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 10,
  minWidth: 0,
  flexGrow: 1,
  flexShrink: 5,
  transition: 'flex-shrink 0.23s cubic-bezier(.56,.15,.37,.97)',
  selectors: {
    '&:empty': {
      display: 'none',
    },
    '&:not(:empty)': {
      minWidth: 40,
    },
    '&:hover': {
      flexShrink: 0.2,
    },
  },
});

export const stackItem = style({
  display: 'flex',
  alignItems: 'center',
  minWidth: 0,
  maxWidth: 128,

  selectors: {
    '&:last-child': {
      minWidth: 'fit-content',
    },
  },
});
export const stackItemContent = style({
  height: 24,
  borderRadius: 12,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: cssVarV2.layer.insideBorder.blackBorder,
  padding: '0px 8px 0px 6px',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  maxWidth: 'min(128px, 300%)',
  minWidth: 48,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  backgroundColor: cssVarV2.layer.background.primary,
  flexShrink: 0,
});

export const stackItemIcon = style({
  width: 16,
  height: 16,
  fontSize: 16,
  color: cssVarV2.icon.primary,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const stackItemLabel = style({
  fontSize: 12,
  lineHeight: '20px',
  color: cssVarV2.text.primary,
  textOverflow: 'ellipsis',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
});

export const inlineProperty = style({
  flexShrink: 0,
  selectors: {
    '&:empty': {
      display: 'none',
    },
  },
});

export const cardProperties = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
});
