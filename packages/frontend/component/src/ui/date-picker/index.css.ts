import { globalStyle, style } from '@vanilla-extract/css';

/**
 * we do not import css from 'react-date-picker' anymore
 **/
globalStyle('.react-datepicker__aria-live', {
  display: 'none',
});

export const basicCell = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '28px',
  maxWidth: '50px',
  flex: '1',
  userSelect: 'none',
});
export const headerLayoutCell = style([basicCell]);
export const headerLayoutCellOrigin = style({
  width: 0,
  height: 'fit-content',
  display: 'flex',
  selectors: {
    '[data-is-left="true"] &': {
      justifyContent: 'flex-start',
      marginLeft: '-12px',
    },
    '[data-is-right="true"] &': {
      justifyContent: 'flex-end',
      marginRight: '-24px',
    },
  },
});

export const inputStyle = style({
  fontSize: 'var(--affine-font-xs)',
  width: '50px',
  fontWeight: '600',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '22px',
  textAlign: 'center',
  ':hover': {
    background: 'var(--affine-hover-color)',
    borderRadius: '4px',
  },
});
export const popperStyle = style({
  boxShadow: 'var(--affine-shadow-2)',
  // TODO: for menu offset, need to be optimized
  marginTop: '16px',
  background: 'var(--affine-background-overlay-panel-color)',
  borderRadius: '12px',
  width: '300px',
  zIndex: 'var(--affine-z-index-popover)',
});

globalStyle('.react-datepicker__header', {
  background: 'none',
  border: 'none',
  marginBottom: '8px',
});
globalStyle('.react-datepicker__header, .react-datepicker__month', {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});
export const headerStyle = style({
  border: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
});
export const monthHeaderStyle = style({
  border: 'none',
  width: '100%',
  marginBottom: '18px',
});
export const monthTitleStyle = style({
  color: 'var(--affine-text-primary-color)',
  fontWeight: '600',
  fontSize: 'var(--affine-font-sm)',
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
  cursor: 'pointer',
  textAlign: 'center',
});
export const headerLabel = style({
  display: 'flex',
  alignItems: 'center',
});
export const headerActionWrapper = style({
  display: 'flex',
  alignItems: 'center',
  gap: 24,
});
export const headerAction = style({
  width: '16px',
  height: '16px',
});

globalStyle('.react-datepicker__day-names, .react-datepicker__week', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
});
export const row = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
});
// header day cell
export const weekStyle = style([
  basicCell,
  {
    height: '28px',
    fontSize: 'var(--affine-font-xs)',
    fontWeight: 500,
    color: 'var(--affine-text-secondary-color)',
  },
]);
export const calendarStyle = style({
  background: 'none',
  border: 'none',
  width: '100%',
  padding: '20px',
});

export const dayStyle = style([
  basicCell,
  {
    height: '28px',
    fontSize: 'var(--affine-font-xs)',
    color: 'var(--affine-text-primary-color)',
    cursor: 'pointer',

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
  },
]);
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
