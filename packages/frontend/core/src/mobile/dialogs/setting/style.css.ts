import {
  bodyEmphasized,
  bodyRegular,
  footnoteRegular,
} from '@toeverything/theme/typography';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const pageTitle = style([
  bodyEmphasized,
  {
    fontSize: 19,
    lineHeight: '24px',
  },
]);

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 22,
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
    fontSize: 17,
    lineHeight: '22px',
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
    fontSize: 17,
    lineHeight: '22px',
  },
]);

export const linkRowContent = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  width: '100%',
  minWidth: 0,
  color: 'inherit',
  textDecoration: 'none',
  selectors: {
    '&:visited': {
      color: 'inherit',
    },
  },
});

export const linkIcon = style({
  fontSize: 17,
  color: cssVarV2('icon/secondary'),
});

export const promoCard = style({
  position: 'relative',
  overflow: 'hidden',
  border: '0.5px solid rgba(255,255,255,0.14)',
  borderRadius: 30,
  padding: '16px 20px 14px',
  width: '100%',
  minHeight: 116,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'flex-start',
  boxSizing: 'border-box',
  textAlign: 'left',
  backgroundColor: cssVarV2('button/primary'),
  backgroundImage:
    'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 34%, rgba(255,255,255,0.02) 100%)',
  color: cssVarV2('button/pureWhiteText'),
  cursor: 'pointer',
  isolation: 'isolate',
  transition: 'transform 180ms ease, box-shadow 180ms ease',
  boxShadow:
    '0 10px 20px rgba(13, 40, 99, 0.12), inset 0 1px 0 rgba(255,255,255,0.12)',
  selectors: {
    '&::before': {
      content: '""',
      position: 'absolute',
      inset: 0,
      background:
        'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 48%)',
      pointerEvents: 'none',
      zIndex: 0,
    },
    '&:active': {
      transform: 'scale(0.995)',
      boxShadow:
        '0 6px 12px rgba(13, 40, 99, 0.1), inset 0 1px 0 rgba(255,255,255,0.1)',
    },
  },
});

export const promoCardEyebrow = style([
  footnoteRegular,
  {
    color: cssVarV2('button/pureWhiteText'),
    opacity: 0.88,
  },
]);

export const promoCardContent = style({
  position: 'relative',
  zIndex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  width: '66%',
  maxWidth: 212,
});

export const promoCardTitle = style({
  fontSize: 20,
  lineHeight: '26px',
  fontWeight: 600,
  color: cssVarV2('button/pureWhiteText'),
  textShadow: '0 0.5px 1px rgba(7, 48, 121, 0.12)',
});

export const promoCardDescription = style({
  fontSize: 16,
  lineHeight: '21px',
  color: cssVarV2('button/pureWhiteText'),
  opacity: 0.94,
  textShadow: '0 0.5px 1px rgba(7, 48, 121, 0.08)',
});

export const promoCardArt = style({
  position: 'absolute',
  right: 14,
  bottom: 10,
  width: 80,
  height: 'auto',
  objectFit: 'contain',
  pointerEvents: 'none',
  zIndex: 1,
  filter: 'drop-shadow(0 6px 12px rgba(7, 48, 121, 0.12))',
  opacity: 0.9,
});

export const dangerZoneTitle = style({
  color: cssVarV2('status/error'),
});
