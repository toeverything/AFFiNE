import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const containerScrollViewport = style({
  maxHeight: '272px',
  width: '360px',
});

export const itemList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});

export const listEmpty = style({
  color: cssVarV2('text/placeholder'),
  fontSize: '14px',
  lineHeight: '22px',
  padding: '4px 2px',
});

export const error = style({
  color: cssVarV2('status/error'),
  fontSize: '14px',
  lineHeight: '22px',
  padding: '4px 2px',
});

export const itemContainer = style({
  display: 'flex',
  flexDirection: 'row',
  borderRadius: '4px',
  position: 'relative',
  padding: '8px',
  gap: '8px',
  cursor: 'pointer',
  selectors: {
    [`&:hover:not([data-disabled="true"])`]: {
      backgroundColor: cssVarV2('layer/background/hoverOverlay'),
    },
  },
});

export const itemMain = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  fontSize: '14px',
  lineHeight: '22px',
});

export const itemDate = style({
  color: cssVarV2('text/secondary'),
  fontSize: '12px',
  lineHeight: '20px',
});

export const itemNotSupported = style({
  color: cssVarV2('text/placeholder'),
  fontSize: '12px',
  lineHeight: '22px',
});

export const itemDeleteButton = style({
  position: 'absolute',
  right: '10px',
  bottom: '8px',
  width: '20px',
  height: '20px',
  backgroundColor: cssVarV2('button/iconButtonSolid'),
  border: `0.5px solid ${cssVarV2('layer/insideBorder/border')}`,
  boxShadow: cssVar('buttonShadow'),
  opacity: 0,
  selectors: {
    [`${itemContainer}:hover &`]: {
      opacity: 1,
    },
  },
});

export const itemNameLabel = style({
  fontWeight: 'bold',
  color: cssVarV2('text/primary'),
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  lineHeight: '22px',
  selectors: {
    [`&[data-inactived="true"]`]: {
      color: cssVarV2('text/placeholder'),
    },
  },
});

export const itemActionButton = style({
  width: 'fit-content',
});
