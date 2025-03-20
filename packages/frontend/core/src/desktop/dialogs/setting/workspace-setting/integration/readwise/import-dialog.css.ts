import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const importDialog = style({
  width: 480,
  maxWidth: `calc(100vw - 32px)`,
  height: '65vh',
  maxHeight: '508px',
  minHeight: 'min(508px, calc(100vh - 32px))',
  display: 'flex',
  flexDirection: 'column',
  transition: 'max-height 0.18s ease, min-height 0.18s ease',
  selectors: {
    '&.select': {
      height: '65vh',
      maxHeight: '508px',
      minHeight: 'min(508px, calc(100vh - 32px))',
    },
    '&.writing': {
      height: '65vh',
      maxHeight: '194px',
      minHeight: 'min(194px, calc(100vh - 32px))',
    },
  },
});

export const title = style({
  fontSize: 15,
  fontWeight: 500,
  lineHeight: '24px',
  color: cssVarV2.text.primary,
  marginBottom: 2,
});

export const desc = style({
  fontSize: 12,
  fontWeight: 400,
  lineHeight: '20px',
  color: cssVarV2.text.secondary,
  marginBottom: 16,
});

export const resetLastImportedAt = style({
  color: cssVarV2.button.primary,
  fontWeight: 500,
});

export const content = style({
  height: 0,
  flexGrow: 1,
});
export const empty = style({
  height: 0,
  flexGrow: 1,
  textAlign: 'center',
  paddingTop: 48,
  color: cssVarV2.text.secondary,
  fontSize: 14,
  lineHeight: '22px',
});

export const footerDivider = style({
  width: 'calc(100% + 48px)',
  margin: '8px -24px',
});
export const actions = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'end',
  gap: 20,
  paddingTop: 20,
});
export const loading = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  color: cssVarV2.text.secondary,
  fontSize: 14,
  lineHeight: '22px',
});

export const table = style({
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
});
export const tableContent = style({
  height: 0,
  flexGrow: 1,
});

export const tableRow = style({
  display: 'flex',
  padding: '6px 0',
  alignItems: 'center',
});
export const tableHeadRow = style([tableRow, {}]);
export const tableBodyRow = style([tableRow, {}]);
export const tableCell = style({
  fontSize: 14,
  lineHeight: '22px',
  selectors: {
    [`${tableHeadRow} &`]: {
      fontSize: 12,
      fontWeight: 500,
      lineHeight: '20px',
      color: cssVarV2.text.secondary,
      whiteSpace: 'nowrap',
    },
  },
});

export const tableCellSelect = style([
  tableCell,
  {
    color: cssVarV2.icon.primary,
    width: 20,
    marginRight: 8,
    fontSize: '20px !important',
    lineHeight: '0px !important',
  },
]);
export const tableCellTitle = style([
  tableCell,
  {
    width: 0,
    flexGrow: 32,
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    color: cssVarV2.text.link,
  },
]);
export const tableCellLink = style({
  color: cssVarV2.text.link,
});

export const tableCellTodo = style([
  tableCell,
  {
    fontSize: 12,
    lineHeight: '20px',
    width: 64,
    marginLeft: 12,
    marginRight: 12,
  },
]);
export const todoNew = style({
  color: cssVarV2.button.success,
});
export const todoSkip = style({
  color: cssVarV2.text.tertiary,
});
export const todoUpdate = style({
  color: cssVarV2.text.primary,
});
export const tableCellTime = style([
  tableCell,
  {
    width: 0,
    flexGrow: 29,
    whiteSpace: 'nowrap',
    fontSize: 12,
    color: cssVarV2.text.secondary,
  },
]);

export const importingHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
});
export const importingLoading = style({
  lineHeight: 0,
});
export const importingTitle = style({
  fontSize: 18,
  fontWeight: 600,
  lineHeight: '26px',
  letterSpacing: '0.24px',
  color: cssVarV2.text.primary,
});
export const importingDesc = style({
  height: 0,
  flexGrow: 1,
  fontSize: 15,
  fontWeight: 400,
  lineHeight: '24px',
  color: cssVarV2.text.primary,
  paddingTop: 12,
});
export const importingFooter = style({
  paddingTop: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'end',
});
