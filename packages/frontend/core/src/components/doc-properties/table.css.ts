import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { createVar, globalStyle, style } from '@vanilla-extract/css';

const propertyNameCellWidth = createVar();
export const fontSize = createVar();

export const root = style({
  display: 'flex',
  width: '100%',
  justifyContent: 'center',
  fontFamily: cssVar('fontSansFamily'),
  vars: {
    [propertyNameCellWidth]: '160px',
    [fontSize]: cssVar('fontSm'),
  },
  '@container': {
    [`viewport (width <= 640px)`]: {
      vars: {
        [fontSize]: cssVar('fontXs'),
      },
    },
  },
});

export const rootCentered = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  width: '100%',
  maxWidth: cssVar('editorWidth'),
  padding: `0 ${cssVar('editorSidePadding', '24px')}`,
  '@container': {
    [`viewport (width <= 640px)`]: {
      padding: '0 16px',
    },
  },
});

export const tableHeader = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
});

export const tableHeaderInfoRow = style({
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  color: cssVarV2('text/secondary'),
  fontSize: fontSize,
  fontWeight: 500,
  minHeight: 34,
  '@media': {
    print: {
      display: 'none',
    },
  },
});

export const tableHeaderSecondaryRow = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  color: cssVar('textPrimaryColor'),
  fontSize: fontSize,
  fontWeight: 500,
  padding: `0 6px`,
  gap: '8px',
  height: 24,
  '@media': {
    print: {
      display: 'none',
    },
  },
});

export const tableHeaderCollapseButtonWrapper = style({
  display: 'flex',
  flex: 1,
  justifyContent: 'flex-end',
  cursor: 'pointer',
});

export const pageInfoDimmed = style({
  color: cssVarV2('text/secondary'),
});

export const tableHeaderBacklinksHint = style({
  padding: `0 6px`,
  cursor: 'pointer',
  borderRadius: '4px',
  ':hover': {
    backgroundColor: cssVarV2('layer/background/hoverOverlay'),
  },
});

export const backlinksList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  fontSize: cssVar('fontSm'),
});

export const tableHeaderTimestamp = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'start',
  gap: '8px',
  cursor: 'default',
  padding: `0 6px`,
});

export const tableHeaderDivider = style({
  height: 0,
  borderTop: `0.5px solid ${cssVarV2('layer/insideBorder/border')}`,
  width: '100%',
  margin: '8px 0',
  '@media': {
    print: {
      display: 'none',
    },
  },
});

export const tableBodyRoot = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  '@media': {
    print: {
      selectors: {
        '&[data-state="open"]': {
          marginBottom: 32,
        },
      },
    },
  },
});

export const tableBodySortable = style({
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
});

export const actionContainer = style({
  display: 'flex',
  flexDirection: 'row',
  gap: 8,
  selectors: {
    [`[data-property-collapsed="true"] &`]: {
      display: 'none',
    },
  },
});

export const propertyActionButton = style({
  alignSelf: 'flex-start',
  fontSize: cssVar('fontSm'),
  color: `${cssVarV2('text/secondary')}`,
  padding: '0 6px',
  height: 36,
  fontWeight: 400,
  gap: 6,
  '@media': {
    print: {
      display: 'none',
    },
  },
});
globalStyle(`${propertyActionButton} svg`, {
  fontSize: 16,
  color: cssVarV2('icon/secondary'),
});
globalStyle(`${propertyActionButton}:hover svg`, {
  color: cssVarV2('icon/primary'),
});

export const propertyConfigButton = style({
  opacity: 0,
  selectors: {
    [`${actionContainer}:hover &`]: {
      opacity: 1,
    },
  },
});

export const collapsedIcon = style({
  transition: 'transform 0.2s ease-in-out',
  selectors: {
    '&[data-collapsed="true"]': {
      transform: 'rotate(90deg)',
    },
  },
});

export const backLinksMenu = style({
  background: cssVarV2('layer/white'),
  maxWidth: 'calc(var(--affine-editor-width) / 2)',
  width: '100%',
  maxHeight: '30vh',
  overflowY: 'auto',
});

export const propertyRootHideEmpty = style({
  selectors: {
    '&:has([data-property-value][data-empty="true"])': {
      display: 'none',
    },
  },
});
