import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';
export const errorLayout = style({
  position: 'absolute',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  height: '100%',
  width: '100%',
  transition: 'all 0.3s ease-in-out',
});
export const errorContainer = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'flex-start',
  height: '100%',
  width: '100%',
  gap: '8px',
  padding: '16px',
  maxWidth: '400px',
  transition: 'max-width 0.3s ease-in-out',
  selectors: {
    '&[data-show-stack="true"]': {
      maxWidth: '600px',
    },
  },
});

export const label = style({
  width: '100%',
  overflow: 'hidden',
  textWrap: 'wrap',
  wordBreak: 'break-word',
});

export const scrollArea = style({
  height: 'auto',
  maxHeight: 0,
  transition: 'max-height 0.3s ease-in-out',
  color: cssVarV2('text/secondary'),
  fontSize: 14,
  lineHeight: '22px',
  fontWeight: 400,
  selectors: {
    '&[data-show-stack="true"]': {
      maxHeight: '200px',
    },
  },
});

export const illustration = style({
  maxWidth: '100%',
  width: 300,
  alignSelf: 'center',
});

export const text = style({
  fontSize: 14,
  lineHeight: '22px',
  fontWeight: 400,
  color: cssVarV2('text/primary'),
  marginBottom: 4,
});

export const actionContainer = style({
  display: 'flex',
  marginTop: '16px',
  width: '100%',
  gap: '32px',
  justifyContent: 'center',
  alignItems: 'center',
});

export const actionButton = style({
  padding: '4px 8px',
  fontSize: 12,
  minWidth: '120px',
});

export const actionContent = style({
  display: 'flex',
  alignItems: 'center',
});

export const arrowIcon = style({
  transition: 'transform 0.3s ease-in-out',
  marginLeft: '8px',
  width: '16px',
  height: '16px',
  selectors: {
    '&[data-show-stack="true"]': {
      transform: 'rotate(180deg)',
    },
  },
});
