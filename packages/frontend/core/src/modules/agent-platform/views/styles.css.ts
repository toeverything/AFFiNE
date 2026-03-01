import { cssVarV2 } from '@toeverything/theme/v2';
import { style, globalStyle } from '@vanilla-extract/css';

export const agentPanel = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  padding: '12px 16px',
  gap: '12px',
  overflow: 'auto',
  fontSize: '13px',
  color: cssVarV2.text.primary,
});

export const section = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '8px 0',
  borderBottom: `1px solid ${cssVarV2.layer.insideBorder.border}`,
});

export const sectionTitle = style({
  fontSize: '12px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: cssVarV2.text.secondary,
});

export const buttonRow = style({
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
});

export const actionButton = style({
  padding: '6px 12px',
  borderRadius: '6px',
  border: 'none',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
  background: cssVarV2.button.primary,
  color: '#fff',
  transition: 'opacity 0.15s',
  ':hover': { opacity: 0.85 },
  ':disabled': { opacity: 0.5, cursor: 'not-allowed' },
});

export const secondaryButton = style({
  padding: '6px 12px',
  borderRadius: '6px',
  border: `1px solid ${cssVarV2.layer.insideBorder.border}`,
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
  background: 'transparent',
  color: cssVarV2.text.primary,
  transition: 'background 0.15s',
  ':hover': { background: cssVarV2.layer.background.hoverOverlay },
  ':disabled': { opacity: 0.5, cursor: 'not-allowed' },
});

export const approveButton = style({
  padding: '8px 16px',
  borderRadius: '6px',
  border: 'none',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  background: '#16a34a',
  color: '#fff',
  transition: 'opacity 0.15s',
  ':hover': { opacity: 0.85 },
  ':disabled': { opacity: 0.5, cursor: 'not-allowed' },
});

export const errorBox = style({
  padding: '8px 12px',
  borderRadius: '6px',
  background: '#fef2f2',
  border: '1px solid #fecaca',
  color: '#dc2626',
  fontSize: '12px',
});

export const timeline = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  padding: '8px 0',
});

export const timelineItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '11px',
  color: cssVarV2.text.secondary,
});

export const timelineDot = style({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  flexShrink: 0,
});

export const timelineDotActive = style({
  background: '#3b82f6',
});

export const timelineDotDone = style({
  background: '#16a34a',
});

export const timelineDotPending = style({
  background: cssVarV2.layer.insideBorder.border,
});

export const ambiguityItem = style({
  padding: '8px',
  borderRadius: '4px',
  background: cssVarV2.layer.background.secondary,
  fontSize: '12px',
});

export const severityBadge = style({
  display: 'inline-block',
  padding: '1px 6px',
  borderRadius: '3px',
  fontSize: '10px',
  fontWeight: 600,
  textTransform: 'uppercase',
  marginRight: '6px',
});

export const diffBlock = style({
  fontFamily: 'monospace',
  fontSize: '11px',
  lineHeight: 1.5,
  padding: '8px',
  borderRadius: '6px',
  background: cssVarV2.layer.background.secondary,
  overflow: 'auto',
  maxHeight: '400px',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
});

export const planEpic = style({
  padding: '6px 8px',
  borderRadius: '4px',
  background: cssVarV2.layer.background.secondary,
  marginBottom: '4px',
});

export const planTask = style({
  padding: '4px 8px 4px 24px',
  fontSize: '12px',
  color: cssVarV2.text.secondary,
});

export const statusBadge = style({
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: '10px',
  fontSize: '11px',
  fontWeight: 500,
});

export const loadingSpinner = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px',
  color: cssVarV2.text.secondary,
  fontSize: '12px',
});

export const configInfo = style({
  fontSize: '11px',
  color: cssVarV2.text.secondary,
  padding: '4px 0',
});

// ─── Stepper styles ──────────────────────────────────────────────────────

export const stepperContainer = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const stepItem = style({
  display: 'flex',
  flexDirection: 'column',
  padding: '8px 12px',
  borderRadius: '6px',
  border: `1px solid ${cssVarV2.layer.insideBorder.border}`,
  transition: 'background 0.15s',
});

export const stepHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  cursor: 'pointer',
});

export const stepNumber = style({
  width: '22px',
  height: '22px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '11px',
  fontWeight: 600,
  flexShrink: 0,
});

export const stepLabel = style({
  flex: 1,
  fontSize: '12px',
  fontWeight: 500,
});

export const stepResultContent = style({
  marginTop: '8px',
  paddingTop: '8px',
  borderTop: `1px solid ${cssVarV2.layer.insideBorder.border}`,
  fontSize: '12px',
  lineHeight: 1.5,
});

export const stepResultTable = style({
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '11px',
  marginTop: '4px',
});

// ─── Markdown rendering styles ────────────────────────────────────────────

export const markdownBody = style({
  lineHeight: 1.6,
  color: 'inherit',
});

globalStyle(`.${markdownBody} .agent-md-codeblock`, {
  background: cssVarV2.layer.background.secondary,
  color: cssVarV2.text.primary,
  padding: '8px',
  borderRadius: '4px',
  overflowX: 'auto',
  fontSize: '12px',
  lineHeight: '1.5',
  margin: '4px 0',
});

globalStyle(`.${markdownBody} .agent-md-inline-code`, {
  background: cssVarV2.layer.background.secondary,
  color: cssVarV2.text.primary,
  padding: '1px 4px',
  borderRadius: '3px',
  fontSize: '12px',
});

globalStyle(`.${markdownBody} .agent-md-table`, {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '12px',
  margin: '6px 0',
});

globalStyle(`.${markdownBody} .agent-md-table th`, {
  fontWeight: 600,
  textAlign: 'left',
  padding: '6px 8px',
  borderBottom: `2px solid ${cssVarV2.layer.insideBorder.border}`,
  background: cssVarV2.layer.background.secondary,
});

globalStyle(`.${markdownBody} .agent-md-table td`, {
  padding: '5px 8px',
  borderBottom: `1px solid ${cssVarV2.layer.insideBorder.border}`,
});

// ─── Edit block styles ────────────────────────────────────────────────────

export const editBlock = style({
  border: `1px solid ${cssVarV2.layer.insideBorder.border}`,
  borderRadius: '6px',
  margin: '8px 0',
  overflow: 'hidden',
});

export const editBlockHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 10px',
  fontSize: '11px',
  fontWeight: 600,
  background: cssVarV2.layer.background.secondary,
  borderBottom: `1px solid ${cssVarV2.layer.insideBorder.border}`,
});

export const editBlockOriginal = style({
  padding: '8px 10px',
  fontSize: '12px',
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  background: '#dc26261a',
  color: cssVarV2.text.primary,
  textDecoration: 'line-through',
  borderBottom: `1px solid ${cssVarV2.layer.insideBorder.border}`,
});

export const editBlockReplacement = style({
  padding: '8px 10px',
  fontSize: '12px',
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  background: '#16a34a1a',
  color: cssVarV2.text.primary,
});

export const editApplyButton = style({
  padding: '3px 10px',
  borderRadius: '4px',
  border: 'none',
  fontSize: '11px',
  fontWeight: 600,
  cursor: 'pointer',
  background: '#16a34a',
  color: '#fff',
  transition: 'opacity 0.15s',
  ':hover': { opacity: 0.85 },
  ':disabled': { opacity: 0.5, cursor: 'not-allowed' },
});

export const editAppliedBadge = style({
  fontSize: '11px',
  fontWeight: 600,
  color: '#16a34a',
});

export const editErrorBadge = style({
  fontSize: '11px',
  fontWeight: 600,
  color: '#dc2626',
});

// ─── Diff viewer styles ─────────────────────────────────────────────────

export const diffViewer = style({
  fontFamily: 'monospace',
  fontSize: '11px',
  lineHeight: 1.6,
  overflow: 'auto',
  maxHeight: '400px',
  border: `1px solid ${cssVarV2.layer.insideBorder.border}`,
  borderRadius: '6px',
  whiteSpace: 'pre',
  padding: 0,
});

export const diffLineAdded = style({
  background: '#16a34a1a',
  display: 'block',
  padding: '0 8px',
});

export const diffLineRemoved = style({
  background: '#dc26261a',
  display: 'block',
  padding: '0 8px',
});

export const diffLineHunk = style({
  background: '#3b82f61a',
  display: 'block',
  padding: '0 8px',
  fontWeight: 600,
  color: cssVarV2.text.secondary,
});

export const diffFileHeader = style({
  display: 'block',
  padding: '4px 8px',
  fontWeight: 700,
  borderTop: `1px solid ${cssVarV2.layer.insideBorder.border}`,
  background: cssVarV2.layer.background.secondary,
  selectors: {
    '&:first-child': { borderTop: 'none' },
  },
});

export const diffLineContext = style({
  display: 'block',
  padding: '0 8px',
});

export const fileStatusList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const fileStatusItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '4px 8px',
  fontSize: '12px',
  fontFamily: 'monospace',
  borderRadius: '4px',
  ':hover': { background: cssVarV2.layer.background.hoverOverlay },
});

export const fileStatusBadge = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '20px',
  height: '18px',
  borderRadius: '3px',
  fontSize: '10px',
  fontWeight: 700,
  flexShrink: 0,
});

export const commitSection = style({
  display: 'flex',
  gap: '8px',
  alignItems: 'center',
  padding: '8px 0',
});

export const commitInput = style({
  flex: 1,
  padding: '6px 8px',
  fontSize: '12px',
  border: `1px solid ${cssVarV2.layer.insideBorder.border}`,
  borderRadius: '6px',
  background: 'transparent',
  color: cssVarV2.text.primary,
  fontFamily: 'inherit',
});

export const logList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
  fontSize: '11px',
  fontFamily: 'monospace',
});

export const logItem = style({
  display: 'flex',
  gap: '8px',
  padding: '2px 8px',
  borderRadius: '3px',
  ':hover': { background: cssVarV2.layer.background.hoverOverlay },
});

export const logHash = style({
  color: '#3b82f6',
  flexShrink: 0,
});

export const logMessage = style({
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: cssVarV2.text.primary,
});

export const taskDropdown = style({
  width: '100%',
  padding: '6px 8px',
  fontSize: '12px',
  border: `1px solid ${cssVarV2.layer.insideBorder.border}`,
  borderRadius: '4px',
  background: 'transparent',
  color: cssVarV2.text.primary,
  marginBottom: '8px',
});
