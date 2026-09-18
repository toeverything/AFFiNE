import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const root = style({
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: '100%',
  overflow: 'auto',
  padding: '32px max(48px, calc((100% - 880px) / 2)) 72px',
  color: cssVar('textPrimaryColor'),
  background: cssVar('backgroundPrimaryColor'),
});

export const header = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  marginBottom: 24,
  paddingBottom: 16,
  borderBottom: `1px solid ${cssVar('borderColor')}`,
});

export const headerTop = style({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 16,
});

export const title = style({
  margin: 0,
  fontSize: 28,
  lineHeight: '36px',
  fontWeight: 600,
});

export const actions = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexShrink: 0,
});

export const button = style({
  height: 32,
  padding: '0 12px',
  border: `1px solid ${cssVar('borderColor')}`,
  borderRadius: 6,
  color: cssVar('textPrimaryColor'),
  background: cssVar('backgroundPrimaryColor'),
  fontSize: 13,
  cursor: 'pointer',
  selectors: {
    '&:disabled': {
      cursor: 'default',
      opacity: 0.55,
    },
  },
});

export const primaryButton = style([
  button,
  {
    color: cssVar('backgroundPrimaryColor'),
    background: cssVar('textPrimaryColor'),
  },
]);

export const meta = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 12,
  lineHeight: '18px',
  color: cssVar('textSecondaryColor'),
});

export const viewport = style({
  position: 'relative',
  flex: 1,
  minHeight: 360,
});

export const spacer = style({
  width: '100%',
});

export const window = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

export const line = style({
  minHeight: 22,
  fontSize: 15,
  lineHeight: '22px',
  overflowWrap: 'anywhere',
  whiteSpace: 'pre-wrap',
});

export const paragraph = style([line]);

export const blank = style({
  height: 14,
});

export const heading = style([
  line,
  {
    marginTop: 10,
    marginBottom: 4,
    fontWeight: 650,
    color: cssVar('textPrimaryColor'),
  },
]);

export const heading1 = style({
  fontSize: 28,
  lineHeight: '36px',
});

export const heading2 = style({
  fontSize: 24,
  lineHeight: '32px',
});

export const heading3 = style({
  fontSize: 20,
  lineHeight: '28px',
});

export const listItem = style([
  line,
  {
    paddingLeft: 18,
    textIndent: -14,
  },
]);

export const quote = style([
  line,
  {
    paddingLeft: 12,
    borderLeft: `3px solid ${cssVar('borderColor')}`,
    color: cssVar('textSecondaryColor'),
  },
]);

export const code = style([
  line,
  {
    boxSizing: 'border-box',
    padding: '2px 8px',
    borderRadius: 4,
    fontFamily:
      'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace',
    fontSize: 13,
    background: cssVarV2.layer.background.secondary,
  },
]);

export const table = style([
  code,
  {
    overflowX: 'hidden',
  },
]);

export const loading = style({
  padding: '24px 0',
  fontSize: 14,
  color: cssVar('textSecondaryColor'),
});

export const error = style({
  padding: 16,
  borderRadius: 6,
  fontSize: 14,
  color: cssVar('errorColor'),
  background: cssVarV2.layer.background.secondary,
});

export const conflict = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  marginBottom: 12,
  padding: 12,
  border: `1px solid ${cssVar('warningColor')}`,
  borderRadius: 6,
  color: cssVar('textPrimaryColor'),
  background: cssVarV2.layer.background.secondary,
  fontSize: 13,
});

export const conflictActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexShrink: 0,
});

export const readonlyNotice = style({
  marginBottom: 12,
  padding: 12,
  border: `1px solid ${cssVar('borderColor')}`,
  borderRadius: 6,
  color: cssVar('textSecondaryColor'),
  background: cssVarV2.layer.background.secondary,
  fontSize: 13,
});

export const editor = style({
  boxSizing: 'border-box',
  width: '100%',
  minHeight: 'calc(100vh - 220px)',
  resize: 'vertical',
  padding: 16,
  border: `1px solid ${cssVar('borderColor')}`,
  borderRadius: 6,
  outline: 'none',
  color: cssVar('textPrimaryColor'),
  background: cssVar('backgroundPrimaryColor'),
  fontFamily:
    'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace',
  fontSize: 14,
  lineHeight: '22px',
});
