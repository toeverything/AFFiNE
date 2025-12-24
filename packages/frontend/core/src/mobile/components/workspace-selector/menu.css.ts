import { cssVar } from '@toeverything/theme';
import {
  bodyEmphasized,
  bodyRegular,
  footnoteRegular,
} from '@toeverything/theme/typography';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const root = style({
  maxHeight:
    'calc(100dvh - 100px - env(safe-area-inset-bottom) - env(safe-area-inset-top))',
  display: 'flex',
  flexDirection: 'column',
});

export const divider = style({
  height: 16,
  display: 'flex',
  alignItems: 'center',
  position: 'relative',
  flexShrink: 0,
  ':before': {
    content: '""',
    width: '100%',
    height: 0.5,
    background: cssVar('dividerColor'),
  },
});

export const head = style([
  bodyEmphasized,
  {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    padding: '10px 16px',
    color: cssVarV2('text/primary'),
  },
]);
export const headActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: 14,
});
export const body = style({
  overflowY: 'auto',
  flexShrink: 0,
  flex: 1,
});
export const wsList = style({});
export const wsListTitle = style([
  footnoteRegular,
  {
    padding: '6px 16px',
    color: cssVar('textSecondaryColor'),
  },
]);
export const wsItem = style({
  padding: '4px 12px',
});
export const wsCard = style({
  display: 'flex',
  alignItems: 'center',
  border: 'none',
  background: 'none',
  width: '100%',
  padding: 8,
  borderRadius: 8,
  gap: 8,

  ':active': {
    background: cssVarV2('layer/background/hoverOverlay'),
  },
});
export const wsName = style([
  bodyRegular,
  {
    width: 0,
    flex: 1,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textAlign: 'left',
  },
]);
export const signInIcon = style({
  width: 32,
  height: 32,
  borderRadius: 6,
  border: `1px solid ${cssVarV2.tab.divider.divider}`,
  color: cssVarV2.icon.primary,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 20,
});

export const serverInfo = style({
  padding: '6px 20px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
});
export const serverName = style([
  footnoteRegular,
  {
    color: cssVarV2.text.secondary,
    flexShrink: 0,
  },
]);
export const serverAccount = style([
  serverName,
  {
    flexShrink: 1,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
  },
]);
export const spaceX = style({
  width: 0,
  flex: 1,
});
