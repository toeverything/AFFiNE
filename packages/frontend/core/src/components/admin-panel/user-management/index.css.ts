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
  borderCollapse: 'collapse',
  width: '100%',
  borderSpacing: 0,
  tableLayout: 'fixed',
});

export const shortHeader = style({
  maxWidth: '50px',
});

globalStyle(`${table} th, ${table} td`, {
  padding: '8px',
  border: `0.5px solid ${cssVar('borderColor')}`,
});

globalStyle(`${table} th`, {
  backgroundColor: cssVar('primaryColor'),
  color: cssVar('pureWhite'),
  fontWeight: 500,
  textAlign: 'left',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

globalStyle(`${table} td`, {
  backgroundColor: cssVar('backgroundPrimaryColor'),
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

globalStyle(`${table} th:first-child`, {
  borderTopLeftRadius: '8px',
  borderTop: 'none',
  borderLeft: 'none',
});
globalStyle(`${table} th:last-child`, {
  borderTopRightRadius: '8px',
  borderTop: 'none',
  borderRight: 'none',
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

export const modalDescription = style({
  marginBottom: '16px',
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
});

export const modalFooter = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '16px',
  marginTop: '16px',
});
