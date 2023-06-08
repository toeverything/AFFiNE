import { globalStyle, style } from '@vanilla-extract/css';

export const inputStyle = style({
  fontSize: 'var(--affine-font-xs)',
  width: '50px',
  fontWeight: '600',
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
  width: '300px',
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
  width: '100%',
  alignItems: 'center',
  marginBottom: '18px',
  padding: '0 14px',
  position: 'relative',
  '::after': {
    content: '""',
    position: 'absolute',
    width: 'calc(100% - 24px)',
    height: '1px',
    background: 'var(--affine-border-color)',
    bottom: '-18px',
    left: '12px',
  },
});
export const monthTitleStyle = style({
  color: 'var(--affine-text-primary-color)',
  fontWeight: '600',
  fontSize: 'var(--affine-font-sm)',
  marginLeft: '12px',
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
  margin: '6px 12px 6px 0px',
  verticalAlign: 'middle',
  fontWeight: '400',
  borderRadius: '8px',
  selectors: {
    '&:hover': {
      background: 'var(--affine-hover-color)',
      borderRadius: '8px',
      transition: 'background-color 0.3s ease-in-out',
    },
    '&[aria-selected="true"]': {
      color: 'var(--affine-black)',
      background: 'var(--affine-hover-color)',
    },
    '&[aria-selected="true"]:hover': {
      background: 'var(--affine-hover-color)',
    },
    '&[tabindex="0"][aria-selected="false"]': {
      background: 'var(--affine-background-overlay-panel-color)',
    },
    '&.react-datepicker__day--today[aria-selected="false"]': {
      background: 'var(--affine-primary-color)',
      color: 'var(--affine-palette-line-white)',
    },
    '&.react-datepicker__day--today[aria-selected="false"]:hover': {
      color: 'var(--affine-black)',
      background: 'var(--affine-hover-color)',
    },
    '&.react-datepicker__day--outside-month[aria-selected="false"]': {
      color: 'var(--affine-text-disable-color)',
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
  lineHeight: '22px',
  padding: '6px 16px',
  fontWeight: '400',
  borderRadius: '8px',
  selectors: {
    '&:hover': {
      background: 'var(--affine-hover-color)',
      transition: 'background-color 0.3s ease-in-out',
      borderRadius: '8px',
    },
    '&[aria-selected="true"]': {
      color: 'var(--affine-black)',
      background: 'var(--affine-hover-color)',
      fontWeight: '400',
    },
    '&[aria-selected="true"]:hover': {
      background: 'var(--affine-hover-color)',
    },
    '&[tabindex="0"][aria-selected="false"]': {
      background: 'var(--affine-background-overlay-panel-color)',
    },
    '&.react-datepicker__month-text--today[aria-selected="false"]': {
      background: 'var(--affine-primary-color)',
      color: 'var(--affine-palette-line-white)',
    },
    '&.react-datepicker__month-text--today[aria-selected="false"]:hover': {
      background: 'var(--affine-hover-color)',
      color: 'var(--affine-black)',
    },
  },
});

globalStyle(`${calendarStyle} .react-datepicker__month-container`, {
  float: 'none',
  width: '100%',
});
globalStyle(`${calendarStyle} .react-datepicker__month-wrapper`, {
  display: 'flex',
  justifyContent: 'space-between',
  marginBottom: '18px',
});
globalStyle(`${calendarStyle} .react-datepicker__month-text`, {
  margin: '0',
  width: '64px',
});
