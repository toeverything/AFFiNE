import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

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

export const tag = style({
  borderRadius: 999,
  padding: '2px 8px',
  fontSize: 11,
  lineHeight: '16px',
  color: cssVarV2('text/secondary'),
  background: cssVarV2('layer/background/secondary'),
});

export const localModelBody = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 16,
});

export const localModelStatusRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
});

export const localModelProgress = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
});

export const localModelMeta = style({
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
});
