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
  gap: 14,
});

export const baseSettingItem = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  width: '100%',
  minHeight: 44,
  padding: '11px 14px',
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
  fontSize: 18,
  color: cssVarV2('icon/secondary'),
});

export const promoCard = style({
  position: 'relative',
  overflow: 'hidden',
  border: 'none',
  borderRadius: 14,
  padding: '14px 16px',
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
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
  fontSize: 18,
  lineHeight: '22px',
  fontWeight: 600,
  maxWidth: '68%',
  color: cssVarV2('button/pureWhiteText'),
  position: 'relative',
  zIndex: 1,
});

export const promoCardDescription = style({
  fontSize: 12,
  lineHeight: '16px',
  maxWidth: '70%',
  color: cssVarV2('button/pureWhiteText'),
  opacity: 0.92,
  position: 'relative',
  zIndex: 1,
});

export const promoCardDecoration = style({
  position: 'absolute',
  right: -10,
  bottom: -16,
  width: 84,
  height: 84,
  borderRadius: '50%',
  background: 'rgba(255, 255, 255, 0.18)',
});

export const promoCardDecorationSecondary = style({
  position: 'absolute',
  right: 22,
  bottom: 10,
  width: 28,
  height: 28,
  borderRadius: '50%',
  background: 'rgba(255, 255, 255, 0.2)',
});
