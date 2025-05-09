import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { globalStyle, style } from '@vanilla-extract/css';

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  '@media': {
    'screen and (max-width: 1024px)': {
      margin: 'auto',
    },
  },
});

export const menuTrigger = style({
  width: '410px',
  height: '40px',
  fontSize: cssVar('fontBase'),
  fontWeight: 500,
  color: cssVarV2('text/placeholder'),
  selectors: {
    '&[data-selected="true"]': {
      color: cssVarV2('text/primary'),
    },
  },
});

export const upgradeButton = style({
  marginTop: '16px',
  marginBottom: '28px',
});

export const contentContainer = style({
  display: 'flex',
  flexDirection: 'column',
  fontSize: cssVar('fontBase'),
  lineHeight: '24px',
});

export const liStyle = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
});

export const doneIcon = style({
  color: cssVarV2('icon/activated'),
  fontSize: '20px',
});

export const workspaceItem = style({
  padding: '8px 12px',
  height: '44px',
});

globalStyle(`${workspaceItem} > div`, {
  gap: '12px',
});

export const createWorkspaceItem = style({
  padding: '8px 12px',
  gap: '12px',
});

export const noWorkspaceItem = style({
  padding: '4px 12px',
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  color: cssVarV2('text/secondary'),
});

export const itemContent = style({
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  lineHeight: '22px',
});

export const itemIcon = style({
  borderRadius: '4px',
  borderColor: cssVarV2('layer/insideBorder/border'),
  borderWidth: '1px',
  borderStyle: 'solid',
  color: cssVarV2('icon/primary'),
});

export const plainMenuItem = style({
  padding: 0,
  ':hover': {
    backgroundColor: 'unset',
  },
});

export const createConfirmContent = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  marginBottom: '40px',
});

export const dialogTitle = style({
  fontSize: cssVar('fontH6'),
  fontWeight: 600,
});

export const dialogMessage = style({
  fontSize: cssVar('fontBase'),
  lineHeight: '24px',
  marginTop: '12px',
  marginBottom: '40px',
});

export const dialogFooter = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '20px',
});

export const upgradeButtonInDialog = style({
  width: 'unset',
});

export const userContainer = style({
  display: 'flex',
  alignItems: 'center',
  marginTop: '28px',
});

export const email = style({
  marginLeft: '4px',
  marginRight: '8px',
});
