import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const workspaceServer = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0px 8px',
  gap: 8,
  marginBottom: 6,
});
export const workspaceServerIcon = style({
  border: `1px solid ${cssVarV2.layer.insideBorder.border}`,
  borderRadius: 4,
  color: cssVarV2.icon.primary,
  fontSize: 18,
  width: 30,
  height: 30,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});
export const workspaceServerContent = style({
  display: 'flex',
  flexDirection: 'column',
});
const ellipsis = style({
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
});
export const workspaceServerAccount = style([
  ellipsis,
  {
    fontSize: cssVar('fontXs'),
    lineHeight: '20px',
    color: cssVarV2.text.secondary,
    marginTop: -1.5,
  },
]);
export const workspaceServerName = style([
  ellipsis,
  {
    fontSize: cssVar('fontXs'),
    lineHeight: '20px',
    fontWeight: 500,
    color: cssVarV2.text.primary,
    selectors: {
      [`&:has(~ ${workspaceServerAccount})`]: {
        marginBottom: -1.5,
      },
    },
  },
]);
export const infoMoreIcon = style({
  color: cssVarV2.icon.secondary,
});

export const workspaceServerSpacer = style({
  width: 0,
  flexGrow: 1,
});

export const workspaceCard = style({
  height: 36,
  padding: '7px 12px',
});
export const workspaceCardInfoContainer = style({
  gap: 12,
});

export const serverDivider = style({
  marginTop: 8,
  marginBottom: 12,
});

export const signInMenuItemContent = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0px 4px',
});
export const signInIconWrapper = style({
  width: 30,
  height: 30,
  borderRadius: 6,
  border: `1px solid ${cssVarV2.tab.divider.divider}`,
  fontSize: 20,
  color: cssVarV2.icon.primary,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});
export const signInText = style({
  fontSize: 14,
  lineHeight: '22px',
  fontWeight: 500,
  color: cssVarV2.text.primary,
});
