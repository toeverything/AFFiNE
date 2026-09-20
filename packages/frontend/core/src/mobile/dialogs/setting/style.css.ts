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

export const emphasizedSettingItemName = style([bodyEmphasized]);

export const rowText = style({
  minWidth: 0,
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
});

export const rowDescription = style([
  footnoteRegular,
  {
    color: cssVarV2('text/secondary'),
    display: '-webkit-box',
    overflow: 'hidden',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
  },
]);

export const rowPrefix = style({
  width: 32,
  height: 32,
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
  fontSize: 18,
  color: cssVarV2('icon/primary'),
  background: cssVarV2('layer/background/secondary'),
});

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

export const dangerZoneTitle = style({
  color: cssVarV2('status/error'),
});
