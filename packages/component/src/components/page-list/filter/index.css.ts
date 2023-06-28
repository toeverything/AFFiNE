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
  background: 'var(--affine-white)',
  margin: '4px',
  padding: '4px 8px',
});

export const filterItemCloseStyle = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  marginLeft: '4px',
});
export const inputStyle = style({
  fontSize: 'var(--affine-font-xs)',
  padding: '2px 4px',
  transition: 'all 0.15s ease-in-out',
  ':hover': {
    cursor: 'pointer',
    background: 'var(--affine-hover-color)',
    borderRadius: '4px',
  },
});
export const switchStyle = style({
  fontSize: 'var(--affine-font-xs)',
  color: 'var(--affine-text-secondary-color)',
  padding: '2px 4px',
  transition: 'all 0.15s ease-in-out',
  ':hover': {
    cursor: 'pointer',
    background: 'var(--affine-hover-color)',
    borderRadius: '4px',
  },
});
export const filterTypeStyle = style({
  fontSize: 'var(--affine-font-sm)',
  display: 'flex',
  padding: '2px 4px',
  transition: 'all 0.15s ease-in-out',
  marginRight: '6px',
  ':hover': {
    cursor: 'pointer',
    background: 'var(--affine-hover-color)',
    borderRadius: '4px',
  },
});
export const filterTypeIconStyle = style({
  fontSize: 'var(--affine-font-base)',
  marginRight: '6px',
  padding: '1px 0',
  display: 'flex',
  color: 'var(--affine-icon-color)',
});
