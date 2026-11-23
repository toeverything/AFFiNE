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
  gap: 8,
  padding: '28px 20px',
  textAlign: 'center',
});
export const skeletons = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 16,
});
export const rows = style({ display: 'flex', flexDirection: 'column' });
export const row = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: 12,
  padding: '12px 16px',
  borderBottom: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  selectors: { '&:last-child': { borderBottom: 0 } },
});
export const rowDisabled = style({
  opacity: 0.55,
  background: cssVarV2('layer/background/secondary'),
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
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
  color: cssVarV2('text/primary'),
});
export const tag = style({
  borderRadius: 999,
  padding: '2px 8px',
  fontSize: 11,
  lineHeight: '16px',
  fontWeight: 400,
  color: cssVarV2('text/secondary'),
  background: cssVarV2('layer/background/secondary'),
});
export const rowActions = style({ display: 'flex', gap: 8 });
export const capabilities = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
});
export const capability = style({
  padding: '14px 16px',
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
  borderRight: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  selectors: { '&:last-child': { borderRight: 0 } },
});
export const modal = style({
  width: 500,
  maxWidth: 'calc(100vw - 32px)',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: 20,
});
export const modalTitle = style({
  fontSize: 18,
  fontWeight: 600,
  color: cssVarV2('text/primary'),
});
export const form = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
});
export const field = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
});
export const fixedValue = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: '8px 10px',
  borderRadius: 8,
  background: cssVarV2('layer/background/secondary'),
  color: cssVarV2('text/primary'),
});
export const select = style({
  height: 32,
  borderRadius: 8,
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  padding: '0 10px',
  background: cssVarV2('layer/background/primary'),
  color: cssVarV2('text/primary'),
});
export const warning = style({
  padding: 12,
  borderRadius: 8,
  background: cssVarV2('layer/background/secondary'),
  color: cssVarV2('text/primary'),
  fontSize: cssVar('fontXs'),
});
export const summary = style({
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
});
export const codeHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
});
export const preArea = style({
  maxHeight: 180,
  overflow: 'auto',
  margin: 0,
  padding: 12,
  borderRadius: 8,
  background: cssVarV2('layer/background/secondary'),
  fontFamily: cssVar('fontMonoFamily'),
  fontSize: cssVar('fontXs'),
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
});
export const modalActions = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
});
