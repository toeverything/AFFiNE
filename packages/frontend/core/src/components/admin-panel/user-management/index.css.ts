import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';

export const container = style({
  maxWidth: '960px',
  padding: '16px',
  justifySelf: 'center',
  margin: '0 auto',
});

export const header = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingBottom: '16px',
});

export const headerRightGroup = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

export const title = style({
  fontSize: cssVar('fontH6'),
  fontWeight: 500,
});

export const table = style({
  borderCollapse: 'separate',
  width: '100%',
  borderSpacing: 0,
  tableLayout: 'fixed',
  boxShadow: cssVar('shadow1'),
  borderRadius: '8px 8px 0 0',
});

export const shortHeader = style({
  maxWidth: '50px',
});

globalStyle(`${table} th`, {
  backgroundColor: cssVar('black10'),
  fontWeight: 500,
  textAlign: 'left',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  padding: '8px',
  border: `0.5px solid ${cssVar('black10')}`,
});

globalStyle(`${table} td`, {
  backgroundColor: cssVar('backgroundPrimaryColor'),
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  padding: '8px',
  border: `0.5px solid ${cssVar('borderColor')}`,
});

globalStyle(`${table} th:first-child`, {
  borderTopLeftRadius: '8px',
});
globalStyle(`${table} th:last-child`, {
  borderTopRightRadius: '8px',
});

globalStyle(`${table} tr:nth-child(even) td`, {
  backgroundColor: cssVar('backgroundSecondaryColor'),
});

export const tdContent = style({
  cursor: 'pointer',
});

export const actions = style({
  display: 'flex',
  gap: '8px',
  justifyContent: 'space-between',
  alignItems: 'center',
});

export const deleteIcon = style({
  color: cssVar('errorColor'),
  background: 'transparent',
  border: 'none',
  ':hover': {
    background: cssVar('backgroundErrorColor'),
  },
});

export const modalTitle = style({
  marginTop: '4px',
  fontSize: cssVar('fontBase'),
  fontWeight: 500,
});

export const warning = style({
  fontWeight: '600',
  marginLeft: '4px',
});

export const modalFooter = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '16px',
});

export const inputContent = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  margin: '24px 0',
  paddingBottom: '16px',
  fontSize: cssVar('fontBase'),
});
