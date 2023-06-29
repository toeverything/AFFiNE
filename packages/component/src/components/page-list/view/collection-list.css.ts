import { style } from '@vanilla-extract/css';

export const menuTitleStyle = style({
  marginLeft: '12px',
  marginTop: '10px',
  fontSize: 'var(--affine-font-xs)',
  color: 'var(--affine-text-secondary-color)',
});
export const menuDividerStyle = style({
  marginTop: '2px',
  marginBottom: '2px',
  marginLeft: '12px',
  marginRight: '8px',
  height: '1px',
  background: 'var(--affine-border-color)',
});
export const viewButton = style({
  borderRadius: '8px',
  height: '100%',
  padding: '4px 8px',
  fontSize: 'var(--affine-font-xs)',
  background: 'var(--affine-white)',
  color: 'var(--affine-text-secondary-color)',
  border: '1px solid var(--affine-border-color)',
  transition: 'margin-left 0.2s ease-in-out',
  ':hover': {
    borderColor: 'var(--affine-border-color)',
    background: 'var(--affine-hover-color)',
  },
  marginRight: '20px',
});
export const viewMenu = style({});
export const viewOption = style({
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginLeft: 6,
  width: 24,
  height: 24,
  opacity: 0,
  ':hover': {
    backgroundColor: 'var(--affine-hover-color)',
  },
  selectors: {
    [`${viewMenu}:hover &`]: {
      opacity: 1,
    },
  },
});
export const deleteOption = style({
  ':hover': {
    backgroundColor: '#FFEFE9',
  },
});
export const filterButton = style({
  borderRadius: '8px',
  height: '100%',
  padding: '4px 8px',
  fontSize: 'var(--affine-font-xs)',
  background: 'var(--affine-white)',
  color: 'var(--affine-text-secondary-color)',
  border: '1px solid var(--affine-border-color)',
  transition: 'margin-left 0.2s ease-in-out',
  ':hover': {
    borderColor: 'var(--affine-border-color)',
    background: 'var(--affine-hover-color)',
  },
});
export const filterButtonCollapse = style({
  marginLeft: '20px',
});
export const viewDivider = style({
  '::after': {
    content: '""',
    display: 'block',
    width: '100%',
    height: '1px',
    background: 'var(--affine-border-color)',
    position: 'absolute',
    bottom: 0,
    left: 0,
    margin: '0 1px',
  },
});
export const saveButton = style({
  marginTop: '4px',
  borderRadius: '8px',
  padding: '8px 0',
  ':hover': {
    background: 'var(--affine-hover-color)',
    color: 'var(--affine-text-primary-color)',
    border: '1px solid var(--affine-border-color)',
  },
});
export const saveButtonContainer = style({
  display: 'flex',
  alignItems: 'center',
  cursor: 'pointer',
  width: '100%',
  height: '100%',
  padding: '8px',
});
export const saveIcon = style({
  display: 'flex',
  alignItems: 'center',
  fontSize: 'var(--affine-font-sm)',
  marginRight: '8px',
});
export const saveText = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 'var(--affine-font-sm)',
});
export const cancelButton = style({
  background: 'var(--affine-hover-color)',
  borderRadius: '8px',
  ':hover': {
    background: 'var(--affine-hover-color)',
    color: 'var(--affine-text-primary-color)',
    border: '1px solid var(--affine-border-color)',
  },
});
export const saveTitle = style({
  fontSize: 'var(--affine-font-h-6)',
  fontWeight: '600',
  lineHeight: '24px',
  paddingBottom: 20,
});
export const allowList = style({});

export const allowTitle = style({
  fontSize: 12,
  margin: '20px 0',
});

export const allowListContent = style({
  margin: '8px 0',
});

export const excludeList = style({
  backgroundColor: 'var(--affine-background-warning-color)',
  padding: 18,
  borderRadius: 8,
});

export const excludeListContent = style({
  margin: '8px 0',
});

export const filterTitle = style({
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 10,
});

export const excludeTitle = style({
  fontSize: 12,
  fontWeight: 600,
});

export const excludeTip = style({
  color: 'var(--affine-text-secondary-color)',
  fontSize: 12,
});

export const scrollContainer = style({
  overflow: 'hidden',
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
});
export const container = style({
  display: 'flex',
  flexDirection: 'column',
});
export const pageContainer = style({
  fontSize: 14,
  fontWeight: 600,
  height: 32,
  display: 'flex',
  alignItems: 'center',
  paddingLeft: 8,
  paddingRight: 5,
});

export const pageIcon = style({
  marginRight: 20,
  display: 'flex',
  alignItems: 'center',
});

export const pageTitle = style({
  flex: 1,
});
export const deleteIcon = style({
  marginLeft: 20,
  display: 'flex',
  alignItems: 'center',
  borderRadius: 4,
  padding: 4,
  cursor: 'pointer',
  ':hover': {
    backgroundColor: 'var(--affine-hover-color)',
  },
});
