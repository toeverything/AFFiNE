import { globalStyle, style } from '@vanilla-extract/css';

export const inputStyle = style({
  fontSize: 'var(--affine-font-xs)',
  width: '70px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '22px',
  marginLeft: '10px',
  marginRight: '10px',
});
export const popperStyle = style({
  boxShadow: 'var(--affine-shadow-2)',
  padding: '0 10px',
  marginTop: '16px',
  background: 'var(--affine-background-overlay-panel-color)',
  borderRadius: '12px',
});
export const monthPopperStyle = style({
  boxShadow: 'var(--affine-shadow-2)',
  marginTop: '16px',
  background: 'var(--affine-background-overlay-panel-color)',
  borderRadius: '12px',
  padding: '0 2px',
  width: '100%',
});

globalStyle('.react-datepicker__header', {
  background: 'var(--affine-background-overlay-panel-color)',
  border: 'none',
  marginBottom: '6px',
});
export const headerStyle = style({
  background: 'var(--affine-background-overlay-panel-color)',
  border: 'none',
  display: 'flex',
  width: '100%',
  alignItems: 'center',
  marginBottom: '12px',
  padding: '0 14px',
  position: 'relative',
});
export const monthHeaderStyle = style({
  background: 'var(--affine-background-overlay-panel-color)',
  border: 'none',
  display: 'flex',
  alignItems: 'center',
  position: 'relative',
  margin: '8px 12px',
  marginBottom: '12px',
  '::after': {
    content: '""',
    position: 'absolute',
    width: 'calc(100% - 24px)',
    height: '1px',
    background: 'var(--affine-border-color)',
    bottom: '-16px',
    left: '12px',
  },
});
export const monthTitleStyle = style({
  color: 'var(--affine-text-primary-color)',
  fontWeight: '600',
  fontSize: 'var(--affine-font-sm)',
  marginLeft: '24px',
});
export const yearStyle = style({
  marginLeft: '8px',
  color: 'var(--affine-text-primary-color)',
  fontWeight: '600',
  fontSize: 'var(--affine-font-sm)',
});
export const mouthStyle = style({
  color: 'var(--affine-text-primary-color)',
  fontWeight: '600',
  fontSize: 'var(--affine-font-sm)',
});
export const arrowLeftStyle = style({
  width: '16px',
  height: '16px',
  textAlign: 'right',
  position: 'absolute',
  right: '50px',
});
export const arrowRightStyle = style({
  width: '16px',
  height: '16px',
  right: '14px',
  position: 'absolute',
});
export const weekStyle = style({
  fontSize: 'var(--affine-font-xs)',
  color: 'var(--affine-text-secondary-color)',
  display: 'inline-block',
  width: '28px',
  height: '28px',
  lineHeight: '28px',
  padding: '0 4px',
  margin: '0px 6px',
  verticalAlign: 'middle',
});
export const calendarStyle = style({
  background: 'var(--affine-background-overlay-panel-color)',
  border: 'none',
});
export const monthCalendarStyle = style({
  background: 'var(--affine-background-overlay-panel-color)',
  border: 'none',
  width: '100%',
});
export const dayStyle = style({
  fontSize: 'var(--affine-font-xs)',
  color: 'var(--affine-text-primary-color)',
  display: 'inline-block',
  width: '28px',
  height: '28px',
  lineHeight: '28px',
  padding: '0 4px',
  margin: '6px',
  verticalAlign: 'middle',

  selectors: {
    '&:hover': {
      background: 'var(--affine-hover-color)',
      borderRadius: '8px',
      transition: 'background-color 0.3s ease-in-out',
    },
    '&[aria-selected="true"]': {
      color: 'var(--affine-white)',
      background: 'var(--affine-primary-color)',
      borderRadius: '8px',
      fontWeight: '400',
    },
    '&[aria-selected="true"]:hover': {
      background: 'var(--affine-primary-color)',
      borderRadius: '8px',
    },
    '&[tabindex="0"][aria-selected="false"]': {
      background: 'var(--affine-tertiary-color)',
      borderRadius: '8px',
    },
  },
});
export const arrowDownStyle = style({
  width: '16px',
  height: '16px',
  marginLeft: '4px',
  color: 'var(--affine-icon-color)',
  fontSize: 'var(--affine-font-sm)',
  cursor: 'pointer',
});
export const mouthsStyle = style({
  fontSize: 'var(--affine-font-base)',
  color: 'var(--affine-text-primary-color)',
  display: 'inline-block',
  height: '32px',
  lineHeight: '22px',
  padding: '4px 16px',

  selectors: {
    '&:hover': {
      background: 'var(--affine-hover-color)',
      borderRadius: '8px',
      transition: 'background-color 0.3s ease-in-out',
    },
    '&[aria-selected="true"]': {
      color: 'var(--affine-white)',
      background: 'var(--affine-primary-color)',
      borderRadius: '8px',
      fontWeight: '400',
    },
    '&[aria-selected="true"]:hover': {
      background: 'var(--affine-primary-color)',
      borderRadius: '8px',
    },
    '&[tabindex="0"][aria-selected="false"]': {
      background: 'var(--affine-tertiary-color)',
      borderRadius: '8px',
    },
  },
});

globalStyle(`${monthCalendarStyle} .react-datepicker__month-container`, {
  float: 'none',
  width: '100%',
});
globalStyle(`${monthCalendarStyle} .react-datepicker__month-wrapper`, {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '0 12px',
  marginBottom: '12px',
});
