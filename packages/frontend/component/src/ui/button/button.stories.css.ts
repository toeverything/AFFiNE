import { globalStyle, style } from '@vanilla-extract/css';

// table
export const table = style({
  vars: { '--border-color': '#974FFF' },
});
globalStyle(`${table} thead td, ${table} tbody tr td:nth-child(1)`, {
  backgroundColor: '#974FFF10',
  padding: '16px',
  fontWeight: 600,
  fontSize: 12,
  color: 'var(--border-color)',
});
globalStyle(`${table} td`, {
  textAlign: 'center',
  border: '0.5px dashed var(--border-color)',
  borderTopColor: 'transparent',
  borderBottomColor: 'transparent',
  padding: '16px 8px',
});
globalStyle(`${table} thead td`, {
  borderTopColor: 'var(--border-color)',
});
globalStyle(`${table} tbody tr:last-child td`, {
  borderBottomColor: 'var(--border-color)',
});

export const settings = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px 100px',
  marginBottom: 40,
});
globalStyle(`${settings} > section`, {
  display: 'flex',
  alignItems: 'center',
});
globalStyle(`${settings} > section > span`, {
  display: 'inline-block',
  width: 200,
});

export const overrideBackground = style({
  background: 'cyan',
});
export const overrideTextColor = style({
  color: 'red',
});
export const overrideBorder = style({
  borderColor: 'green',
});
export const overrideFontSize = style({
  fontSize: 24,
});
export const overrideIconSize = style({
  width: 60,
  height: 60,
});
export const overrideIconColor = style({
  color: 'forestgreen',
});
