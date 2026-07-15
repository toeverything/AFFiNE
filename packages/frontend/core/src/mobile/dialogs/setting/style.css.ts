import {
  bodyEmphasized,
  bodyRegular,
  footnoteRegular,
} from '@toeverything/theme/typography';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const pageTitle = style([bodyEmphasized]);

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  paddingTop: 0,
  paddingRight: 16,
  paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)',
  paddingLeft: 16,
  boxSizing: 'border-box',
});

export const baseSettingItem = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  width: '100%',
  minHeight: 44,
  padding: '10px 14px',
  boxSizing: 'border-box',
  selectors: {
    '&:not(:last-child)': {
      borderBottom: `0.5px solid ${cssVarV2('layer/insideBorder/border')}`,
    },
  },
});

export const interactiveRow = style({
  cursor: 'pointer',
  transition: 'background-color 160ms ease',
  selectors: {
    '&:active': {
      background: cssVarV2('layer/background/hoverOverlay'),
    },
  },
});

export const baseSettingItemName = style([
  bodyRegular,
  {
    color: cssVarV2('text/primary'),
    minWidth: 0,
    flex: 1,
  },
]);

export const baseSettingItemAction = style([
  bodyRegular,
  {
    color: cssVarV2('text/placeholder'),
    marginLeft: 12,
    minWidth: 0,
    flexShrink: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
  },
]);

export const linkIcon = style({
  fontSize: 17,
  color: cssVarV2('icon/secondary'),
});

export const promoCard = style({
  position: 'relative',
  overflow: 'hidden',
  border: 'none',
  borderRadius: 12,
  padding: '12px 14px',
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  boxSizing: 'border-box',
  textAlign: 'left',
  background: cssVarV2('button/primary'),
  color: cssVarV2('button/pureWhiteText'),
  cursor: 'pointer',
});

export const promoCardEyebrow = style([
  footnoteRegular,
  {
    color: cssVarV2('button/pureWhiteText'),
    opacity: 0.88,
  },
]);

export const promoCardTitle = style({
  fontSize: 17,
  lineHeight: '21px',
  fontWeight: 600,
  maxWidth: '74%',
  color: cssVarV2('button/pureWhiteText'),
  position: 'relative',
  zIndex: 1,
});

export const promoCardDescription = style({
  fontSize: 11,
  lineHeight: '15px',
  maxWidth: '74%',
  color: cssVarV2('button/pureWhiteText'),
  opacity: 0.92,
  position: 'relative',
  zIndex: 1,
});

export const promoCardArt = style({
  position: 'absolute',
  right: 10,
  bottom: 9,
  width: 58,
  height: 'auto',
  objectFit: 'contain',
  pointerEvents: 'none',
});

export const dangerZoneTitle = style({
  color: cssVarV2('status/error'),
});
