import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const stack = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
});

export const panel = style({
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 8,
  overflow: 'hidden',
  background: cssVarV2('layer/background/primary'),
});

export const panelHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '12px 16px',
  borderBottom: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
});

export const title = style({
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
  color: cssVarV2('text/primary'),
});

export const description = style({
  fontSize: cssVar('fontXs'),
  lineHeight: '20px',
  color: cssVarV2('text/secondary'),
});

export const empty = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  padding: '28px 20px',
  textAlign: 'center',
});

export const rows = style({
  display: 'flex',
  flexDirection: 'column',
});

export const row = style({
  display: 'grid',
  gridTemplateColumns: '24px 1fr auto',
  alignItems: 'center',
  gap: 12,
  padding: '12px 16px',
  borderBottom: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  selectors: {
    '&:last-child': {
      borderBottom: 0,
    },
  },
});

export const capabilityRow = style({
  gridTemplateColumns: '32px 1fr',
});

export const capabilityRowInactive = style({
  opacity: 0.48,
  background: cssVarV2('layer/background/secondary'),
});

export const capabilityIcon = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  borderRadius: 6,
  color: cssVarV2('text/secondary'),
  background: cssVarV2('layer/background/secondary'),
});

export const capabilityIconActive = style({
  color: cssVarV2('button/primary'),
  background: '#f0f7ff',
});

export const capabilityIconSvg = style({
  width: 16,
  height: 16,
});

export const rowDisabled = style({
  opacity: 0.55,
  background: cssVarV2('layer/background/secondary'),
});

export const dragHandle = style({
  color: cssVarV2('text/secondary'),
  cursor: 'grab',
  textAlign: 'center',
});

export const rowMain = style({
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

export const rowTitle = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minWidth: 0,
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
  color: cssVarV2('text/primary'),
});

export const rowDescription = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
});

export const tags = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
});

export const tag = style({
  borderRadius: 999,
  padding: '2px 8px',
  fontSize: 11,
  lineHeight: '16px',
  color: cssVarV2('text/secondary'),
  background: cssVarV2('layer/background/secondary'),
});

export const dangerTag = style({
  color: '#b42318',
  background: '#fff5f5',
});

export const rowActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
});

export const notice = style({
  borderRadius: 8,
  padding: 12,
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  background: cssVarV2('layer/background/secondary'),
});

export const locked = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: 24,
  borderRadius: 8,
  background: cssVarV2('layer/background/secondary'),
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
});

export const form = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
});

export const field = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  height: '3em',
});

export const label = style({
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
});

export const input = style({
  height: 32,
  width: '100%',
  boxSizing: 'border-box',
  borderRadius: 8,
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  padding: '0 10px',
  fontSize: cssVar('fontSm'),
  lineHeight: '22px',
  background: cssVarV2('layer/background/primary'),
  color: cssVarV2('text/primary'),
  outline: 'none',
  selectors: {
    '&::placeholder': {
      color: cssVarV2('text/placeholder'),
    },
    '&:focus': {
      borderColor: cssVarV2('button/primary'),
      boxShadow: '0px 0px 0px 2px rgba(30, 150, 235, 0.30)',
    },
  },
});

export const modalActions = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 8,
  marginTop: 8,
});

export const testStatus = style({
  marginRight: 'auto',
  fontSize: cssVar('fontXs'),
});

export const error = style({
  color: '#b42318',
});

export const success = style({
  color: '#168a58',
});

export const chart = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(30, minmax(4px, 1fr))',
  alignItems: 'end',
  gap: 4,
  height: 140,
  padding: '16px 16px 24px',
});

export const bar = style({
  minHeight: 2,
  borderRadius: '4px 4px 0 0',
  background: '#5b8def',
});
