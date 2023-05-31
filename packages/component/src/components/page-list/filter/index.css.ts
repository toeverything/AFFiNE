import { style } from '@vanilla-extract/css';

export const menuItemStyle = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  padding: '0px 24px 0px 8px',
});
export const variableSelectTitleStyle = style({
  marginLeft: '12px',
  marginTop: '10px',
  fontSize: 'var(--affine-font-xs)',
  color: 'var(--affine-text-secondary-color)',
});
export const variableSelectDividerStyle = style({
  marginTop: '2px',
  marginBottom: '2px',
  marginLeft: '12px',
  marginRight: '8px',
  height: '1px',
  background: 'var(--affine-border-color)',
});
export const menuItemTextStyle = style({
  fontSize: 'var(--affine-font-sm)',
});
export const filterItemStyle = style({
  display: 'flex',
  border: '1px solid var(--affine-border-color)',
  borderRadius: '8px',
  padding: '2px 6px',
  margin: 4,
  background: 'var(--affine-white)',
});
