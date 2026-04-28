import { cssVarV2 } from '@toeverything/theme/v2';
import { globalStyle,style } from '@vanilla-extract/css';

export const htmlPageEditorRoot = style({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '100%',
  minHeight: 'calc(100vh - 120px)',
});

export const toolbar = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 16px',
  borderBottom: `1px solid ${cssVarV2('layer/border')}`,
  background: cssVarV2('layer/background/primary'),
  position: 'sticky',
  top: 0,
  zIndex: 10,
  flexShrink: 0,
});

export const toolbarGroup = style({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
});

export const toolbarSeparator = style({
  width: 1,
  height: 20,
  background: cssVarV2('layer/border'),
  margin: '0 8px',
});

export const modeToggle = style({
  display: 'flex',
  alignItems: 'center',
  gap: 0,
  borderRadius: 8,
  overflow: 'hidden',
  border: `1px solid ${cssVarV2('layer/border')}`,
});

export const modeButton = style({
  padding: '4px 12px',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  color: cssVarV2('text/secondary'),
  transition: 'all 0.15s ease',
  selectors: {
    '&[data-active="true"]': {
      background: cssVarV2('button/primary'),
      color: '#fff',
    },
  },
});

export const sandboxToggle = style({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  border: `1px solid ${cssVarV2('layer/border')}`,
  background: 'transparent',
  color: cssVarV2('text/secondary'),
  transition: 'all 0.15s ease',
  selectors: {
    '&:hover': {
      background: cssVarV2('layer/background/hoverOverlay'),
    },
  },
});

export const sandboxDot = style({
  width: 8,
  height: 8,
  borderRadius: '50%',
  transition: 'background 0.15s ease',
});

export const sandboxRestricted = style({
  background: '#22c55e',
});

export const sandboxUnrestricted = style({
  background: '#f59e0b',
});

export const editorArea = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  position: 'relative',
});

export const codeEditor = style({
  width: '100%',
  height: '100%',
  border: 'none',
  outline: 'none',
  resize: 'none',
  padding: '20px 24px',
  fontFamily:
    "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
  fontSize: 13,
  lineHeight: 1.6,
  tabSize: 2,
  background: cssVarV2('layer/background/primary'),
  color: cssVarV2('text/primary'),
  boxSizing: 'border-box',
});

export const previewFrame = style({
  width: '100%',
  height: '100%',
  border: 'none',
  background: '#fff',
});

export const statusBar = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '4px 16px',
  borderTop: `1px solid ${cssVarV2('layer/border')}`,
  background: cssVarV2('layer/background/secondary'),
  fontSize: 11,
  color: cssVarV2('text/tertiary'),
  flexShrink: 0,
});
