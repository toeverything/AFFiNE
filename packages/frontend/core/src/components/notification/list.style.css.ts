import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { keyframes, style } from '@vanilla-extract/css';

export const container = style({
  maxHeight: '448px',
  width: '360px',
  display: 'flex',
  flexDirection: 'column',

  selectors: {
    '&[data-mobile]': {
      width: '100%',
    },
  },
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: cssVar('fontSm'),
  lineHeight: '22px',
  padding: '4px 8px 8px',
  borderBottom: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
});

export const scrollRoot = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
});

export const scrollViewport = style({
  flex: 1,
  padding: '8px 0px ',
});

export const itemList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});

export const listEmpty = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '2px',
  height: '184px',
  padding: '16px 45px',
});

export const listEmptyIconContainer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '40px',
  height: '40px',
  marginBottom: '14px',
  borderRadius: '50%',
  backgroundColor: cssVarV2('layer/background/secondary'),
  color: cssVarV2('icon/primary'),
});

export const listEmptyTitle = style({
  color: cssVarV2('text/primary'),
  fontSize: '14px',
  lineHeight: '22px',
  textAlign: 'center',
});

export const listEmptyDescription = style({
  color: cssVarV2('text/secondary'),
  fontSize: '14px',
  lineHeight: '20px',
  textAlign: 'center',
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
    [`&:hover:not([data-disabled="true"],:has(button:hover))`]: {
      backgroundColor: cssVarV2('layer/background/hoverOverlay'),
    },
  },
});

export const itemSkeletonContainer = style({
  opacity: 0,
  animation: `${keyframes({
    '0%': { opacity: 0 },
    '100%': { opacity: 1 },
  })} 500ms ease forwards 1s`,
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

export const itemNameLabel = style({
  fontWeight: '500',
  color: cssVarV2('text/primary'),
  display: 'inline',
  verticalAlign: 'top',
  selectors: {
    [`&[data-inactived="true"]`]: {
      color: cssVarV2('text/placeholder'),
    },
  },
});

export const itemActionButton = style({
  width: 'fit-content',
  borderRadius: '4px',
});

export const itemNameLabelIcon = style({
  verticalAlign: 'top',
  marginRight: '4px',
  color: cssVarV2('icon/primary'),
});

export const loadMoreIndicator = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '24px',
  color: cssVarV2('text/secondary'),
});
