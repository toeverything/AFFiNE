import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const containerStyle = style({
  display: 'flex',
  width: '100%',
  flexDirection: 'column',
  gap: '8px',
  height: '100%',
  flex: 1,
  overflowY: 'hidden',
});

export const headerStyle = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  borderBottom: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  cursor: 'pointer',
  gap: '4px',
  padding: '0px 4px 6px',
  height: '28px',
  color: cssVarV2('text/secondary'),
});
export const iconStyle = style({
  fontSize: '20px',
  color: cssVarV2('icon/primary'),
});

export const footerStyle = style({
  display: 'flex',
  flexDirection: 'row',
  borderTop: `1px solid ${cssVarV2('tab/divider/divider')}`,
  paddingTop: '8px',
});
export const addCollaboratorsStyle = style({
  color: cssVarV2('text/link'),
  cursor: 'pointer',
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  padding: '5px 4px',
});

export const memberListStyle = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  paddingTop: '6px',
  height: '100%',
  minHeight: '206px',
  maxHeight: '394px',
});

export const scrollableRootStyle = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
});

export const scrollbar = style({
  width: 6,
});
