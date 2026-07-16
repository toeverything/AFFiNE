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
    fontSize: 19,
    lineHeight: '24px',
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
    fontSize: 19,
    lineHeight: '24px',
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
  borderRadius: 14,
  padding: '12px 14px',
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  boxSizing: 'border-box',
  textAlign: 'left',
  backgroundColor: cssVarV2('button/primary'),
  backgroundImage:
    'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 32%, rgba(6,59,151,0.08) 100%)',
  color: cssVarV2('button/pureWhiteText'),
  cursor: 'pointer',
  isolation: 'isolate',
  transition: 'transform 180ms ease, box-shadow 180ms ease',
  boxShadow:
    '0 8px 18px rgba(13, 40, 99, 0.12), 0 1px 3px rgba(13, 40, 99, 0.08), inset 0 1px 0 rgba(255,255,255,0.14)',
  selectors: {
    '&::before': {
      content: '""',
      position: 'absolute',
      inset: 0,
      background:
        'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 44%)',
      pointerEvents: 'none',
      zIndex: 0,
    },
    '&::after': {
      content: '""',
      position: 'absolute',
      right: -6,
      bottom: -10,
      width: 78,
      height: 78,
      borderRadius: '50%',
      background:
        'radial-gradient(circle, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 70%)',
      opacity: 0.38,
      pointerEvents: 'none',
      zIndex: 0,
    },
    '&:active': {
      transform: 'scale(0.995)',
      boxShadow:
        '0 5px 12px rgba(13, 40, 99, 0.1), 0 1px 2px rgba(13, 40, 99, 0.07), inset 0 1px 0 rgba(255,255,255,0.12)',
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

export const promoCardTitle = style({
  fontSize: 19,
  lineHeight: '24px',
  fontWeight: 600,
  maxWidth: '74%',
  color: cssVarV2('button/pureWhiteText'),
  position: 'relative',
  zIndex: 1,
  textShadow: '0 0.5px 1px rgba(7, 48, 121, 0.14)',
});

export const promoCardDescription = style({
  fontSize: 13,
  lineHeight: '18px',
  maxWidth: '74%',
  color: cssVarV2('button/pureWhiteText'),
  opacity: 0.92,
  position: 'relative',
  zIndex: 1,
  textShadow: '0 0.5px 1px rgba(7, 48, 121, 0.1)',
});

export const promoCardArt = style({
  position: 'absolute',
  right: 8,
  bottom: 6,
  width: 64,
  height: 'auto',
  objectFit: 'contain',
  pointerEvents: 'none',
  zIndex: 1,
  filter: 'drop-shadow(0 4px 8px rgba(7, 48, 121, 0.14))',
  opacity: 0.96,
});

export const dangerZoneTitle = style({
  color: cssVarV2('status/error'),
});
