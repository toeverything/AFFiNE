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
  background: cssVarV2('chip/label/blue'),
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
  gap: 16,
  maxHeight: 'min(720px, calc(100vh - 180px))',
  overflowY: 'auto',
  paddingRight: 2,
});

export const field = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

export const endpointField = style([field, { height: 'auto' }]);

export const label = style({
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
});

export const fieldHint = style({
  fontSize: cssVar('fontXs'),
  lineHeight: '18px',
  color: cssVarV2('text/secondary'),
});

export const input = style({
  height: 32,
  minHeight: 32,
  maxHeight: 32,
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
  position: 'sticky',
  bottom: 0,
  paddingTop: 12,
  background: cssVarV2('layer/background/primary'),
});

export const formSection = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 14,
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 10,
});

export const sectionHeading = style({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
});

export const sectionTitle = style({
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
  color: cssVarV2('text/primary'),
});

export const storageOptions = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 8,
});

export const storageOption = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'flex-start',
  minHeight: 76,
  boxSizing: 'border-box',
  padding: 12,
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 8,
  color: cssVarV2('text/primary'),
  fontSize: cssVar('fontSm'),
  cursor: 'pointer',
  selectors: {
    '&:has(input:checked)': {
      borderColor: cssVarV2('button/primary'),
      background: cssVarV2('layer/background/secondary'),
    },
    '&:has(input:focus-visible)': {
      boxShadow: '0px 0px 0px 2px rgba(30, 150, 235, 0.30)',
    },
    '&[data-disabled="true"]': {
      cursor: 'not-allowed',
      color: cssVarV2('text/disable'),
      background: cssVarV2('layer/background/secondary'),
    },
  },
});

export const storageRadio = style({
  position: 'absolute',
  width: 1,
  height: 1,
  margin: 0,
  opacity: 0,
  pointerEvents: 'none',
});

export const storageCopy = style({
  display: 'flex',
  minWidth: 0,
  flexDirection: 'column',
  gap: 2,
  lineHeight: '20px',
});

export const storageDescription = style({
  color: cssVarV2('text/secondary'),
  fontSize: cssVar('fontXs'),
  selectors: {
    [`${storageOption}[data-disabled="true"] &`]: {
      color: cssVarV2('text/disable'),
    },
  },
});

export const checkboxRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/primary'),
});

export const modelToolbar = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
});

export const selectedModels = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  margin: 0,
  padding: 0,
  listStyle: 'none',
});

export const selectedModel = style({
  display: 'grid',
  gridTemplateColumns: '20px minmax(0, 1fr) auto auto auto',
  alignItems: 'center',
  gap: 10,
  minHeight: 72,
  padding: '10px 12px',
  borderRadius: 8,
  background: cssVarV2('layer/background/secondary'),
  color: cssVarV2('text/primary'),
  fontSize: cssVar('fontSm'),
});

export const selectedModelDisabled = style({
  opacity: 0.58,
});

export const modelDragHandle = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: cssVarV2('text/secondary'),
  cursor: 'grab',
});

export const modelCopy = style({
  display: 'flex',
  minWidth: 0,
  flexDirection: 'column',
  gap: 2,
});

export const modelStatus = style({
  color: cssVarV2('text/secondary'),
  fontSize: cssVar('fontXs'),
  whiteSpace: 'nowrap',
});

export const recommended = style({
  padding: '2px 6px',
  borderRadius: 999,
  color: cssVarV2('button/primary'),
  background: cssVarV2('chip/label/blue'),
  fontSize: 11,
  fontWeight: 400,
  lineHeight: '16px',
});

export const modelEmpty = style({
  padding: '24px 16px',
  borderRadius: 8,
  textAlign: 'center',
  color: cssVarV2('text/secondary'),
  background: cssVarV2('layer/background/secondary'),
  fontSize: cssVar('fontXs'),
});

export const modelModalBody = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  maxHeight: 'min(440px, calc(100dvh - 220px))',
  overflowY: 'auto',
});

export const modelModalDescription = style({
  margin: '0 0 12px',
  color: cssVarV2('text/secondary'),
  fontSize: cssVar('fontSm'),
  lineHeight: '20px',
});

export const modelSearch = style({
  flexShrink: 0,
});

export const modelFieldLabel = style({
  color: cssVarV2('text/secondary'),
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  lineHeight: '20px',
});

export const catalogChoices = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  paddingBottom: 8,
});

export const catalogChoice = style({
  display: 'grid',
  gridTemplateColumns: '16px minmax(0, 1fr)',
  alignItems: 'center',
  columnGap: 10,
  minHeight: 56,
  boxSizing: 'border-box',
  padding: '8px 10px',
  border: '1px solid transparent',
  borderRadius: 8,
  background: cssVarV2('layer/background/secondary'),
  color: cssVarV2('text/primary'),
  fontSize: cssVar('fontSm'),
  cursor: 'pointer',
  selectors: {
    '&[data-selected="true"]': {
      borderColor: cssVarV2('button/primary'),
      background: cssVarV2('chip/label/blue'),
    },
  },
});

export const modelCheckbox = style({
  flex: '0 0 auto',
  fontSize: 16,
});

export const catalogModelCopy = style({
  display: 'flex',
  minWidth: 0,
  flexDirection: 'column',
  gap: 2,
});

export const catalogModelTitle = style({
  display: 'flex',
  minWidth: 0,
  alignItems: 'center',
  gap: 6,
  fontSize: cssVar('fontSm'),
  lineHeight: '20px',
});

export const catalogModelMeta = style({
  overflow: 'hidden',
  color: cssVarV2('text/secondary'),
  fontSize: cssVar('fontXs'),
  lineHeight: '16px',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const modelCapabilities = style({
  minWidth: 0,
  margin: 0,
  padding: 0,
  border: 0,
});

export const useCaseGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  columnGap: 16,
  rowGap: 4,
  marginTop: 8,
  '@media': {
    '(max-width: 600px)': {
      gridTemplateColumns: '1fr',
    },
  },
});

export const modelUseCase = style({
  width: '100%',
  minHeight: 28,
  gap: 8,
  color: cssVarV2('text/primary'),
  fontSize: 16,
  lineHeight: '20px',
});

export const modelUseCaseLabel = style({
  fontSize: cssVar('fontSm'),
});

export const modelModalActions = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  marginTop: 12,
  paddingTop: 12,
  borderTop: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
});

export const advanced = style({
  color: cssVarV2('text/secondary'),
  fontSize: cssVar('fontSm'),
});

export const advancedFields = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  marginTop: 10,
});

export const inputStack = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
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
