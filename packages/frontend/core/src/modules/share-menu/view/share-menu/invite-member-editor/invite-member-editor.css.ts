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
  overflow: 'hidden',
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

export const memberListStyle = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  overflowY: 'auto',
  flex: 1,
});

export const footerStyle = style({
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'space-between',
  borderTop: `1px solid ${cssVarV2('tab/divider/divider')}`,
  paddingTop: '8px',
});
export const manageMemberStyle = style({
  color: cssVarV2('text/link'),
  cursor: 'pointer',
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  padding: '5px 4px',
});

export const searchInput = style({
  flexGrow: 1,
  border: 'none',
  outline: 'none',
  fontSize: cssVar('fontSm'),
  fontFamily: 'inherit',
  color: 'inherit',
  backgroundColor: 'transparent',
  '::placeholder': {
    color: cssVarV2('text/placeholder'),
  },
});

export const InputContainer = style({
  display: 'flex',
  gap: '4px',
  borderRadius: '4px',
  padding: '4px',
  flexWrap: 'wrap',
  width: '100%',
  margin: '6px 0px',
  border: `1px solid ${cssVarV2('input/border/default')}`,

  selectors: {
    '&.focus': {
      borderColor: cssVarV2('input/border/active'),
    },
  },
});
export const inlineMembersContainer = style({
  display: 'flex',
  flexWrap: 'wrap',
  width: '100%',
  flex: 1,
  gap: '4px',
  maxHeight: '60px',
  overflowY: 'auto',
});
export const roleSelectorContainer = style({
  flexShrink: 0,
});

export const menuTriggerStyle = style({
  padding: '1px 2px',
  gap: '4px',
  height: '22px',
  borderRadius: '2px',
  justifyContent: 'space-between',
  display: 'flex',
  fontSize: cssVar('fontXs'),
  fontWeight: 400,
});

export const buttonsContainer = style({
  display: 'flex',
  flexDirection: 'row',
  gap: '12px',
  flexShrink: 0,
});

export const button = style({
  padding: '4px 12px',
  borderRadius: '4px',
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  display: 'flex',
  alignItems: 'center',
});

export const sentEmail = style({
  display: 'flex',
  flexDirection: 'row',
  gap: '8px',
  alignItems: 'center',
  fontSize: cssVar('fontSm'),

  // TODO(@JimmFly): remove this when we have a sent email feature
  cursor: 'not-allowed',
  color: cssVarV2('text/disable'),
});

export const checkbox = style({
  fontSize: 20,
  color: cssVarV2('icon/primary'),
});

export const resultContainer = style({
  minHeight: '155px',
  maxHeight: '394px',
  overflow: 'hidden',
});

export const noFound = style({
  fontSize: cssVar('fontSm'),
  color: cssVarV2('text/secondary'),
});

export const scrollbar = style({
  width: 6,
});

export const planTagContainer = style({
  display: 'flex',
  gap: '8px',
  alignItems: 'center',
});
