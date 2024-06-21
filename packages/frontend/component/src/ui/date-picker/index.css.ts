import { cssVar } from '@toeverything/theme';
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
  fontSize: cssVar('fontXs'),
  width: '50px',
  fontWeight: '600',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '22px',
  textAlign: 'center',
  ':hover': {
    background: cssVar('hoverColor'),
    borderRadius: '4px',
  },
});
export const popperStyle = style({
  boxShadow: cssVar('shadow2'),
  // TODO(@catsjuice): for menu offset, need to be optimized
  marginTop: '16px',
  background: cssVar('backgroundOverlayPanelColor'),
  borderRadius: '12px',
  width: '300px',
  zIndex: cssVar('zIndexPopover'),
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
  color: cssVar('textPrimaryColor'),
  fontWeight: '600',
  fontSize: cssVar('fontSm'),
});
export const yearStyle = style({
  marginLeft: '8px',
  color: cssVar('textPrimaryColor'),
  fontWeight: '600',
  fontSize: cssVar('fontSm'),
});
export const mouthStyle = style({
  color: cssVar('textPrimaryColor'),
  fontWeight: '600',
  fontSize: cssVar('fontSm'),
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
    fontSize: cssVar('fontXs'),
    fontWeight: 500,
    color: cssVar('textSecondaryColor'),
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
    fontSize: cssVar('fontXs'),
    color: cssVar('textPrimaryColor'),
    cursor: 'pointer',
    fontWeight: '400',
    borderRadius: '8px',
    selectors: {
      '&[aria-selected="false"]:hover': {
        background: cssVar('hoverColor'),
        borderRadius: '8px',
        transition: 'background-color 0.3s ease-in-out',
      },
      '&[aria-selected="true"]': {
        color: cssVar('pureWhite'),
        background: cssVar('primaryColor'),
        fontWeight: '500',
      },
      '&[tabindex="0"][aria-selected="false"]': {
        background: cssVar('backgroundOverlayPanelColor'),
      },
      '&.react-datepicker__day--today[aria-selected="false"]': {
        fontWeight: '600',
        color: cssVar('primaryColor'),
      },
      '&.react-datepicker__day--outside-month[aria-selected="false"]': {
        color: cssVar('textDisableColor'),
      },
    },
  },
]);
export const arrowDownStyle = style({
  width: '16px',
  height: '16px',
  marginLeft: '4px',
  color: cssVar('iconColor'),
  fontSize: cssVar('fontSm'),
  cursor: 'pointer',
});
export const mouthsStyle = style({
  fontSize: cssVar('fontBase'),
  color: cssVar('textPrimaryColor'),
  display: 'inline-block',
  lineHeight: '22px',
  padding: '6px 16px',
  fontWeight: '400',
  borderRadius: '8px',
  selectors: {
    '&:hover': {
      background: cssVar('hoverColor'),
      transition: 'background-color 0.3s ease-in-out',
      borderRadius: '8px',
    },
    '&[aria-selected="true"]': {
      color: cssVar('black'),
      background: cssVar('hoverColor'),
      fontWeight: '400',
    },
    '&[aria-selected="true"]:hover': {
      background: cssVar('hoverColor'),
    },
    '&[tabindex="0"][aria-selected="false"]': {
      background: cssVar('backgroundOverlayPanelColor'),
    },
    '&.react-datepicker__month-text--today[aria-selected="false"]': {
      background: cssVar('primaryColor'),
      color: cssVar('paletteLineWhite'),
    },
    '&.react-datepicker__month-text--today[aria-selected="false"]:hover': {
      background: cssVar('hoverColor'),
      color: cssVar('black'),
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
