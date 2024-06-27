import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';
export const headerStyle = style({
  display: 'flex',
  alignItems: 'center',
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
  lineHeight: '22px',
  padding: '0 4px',
  gap: '4px',
});
export const menuStyle = style({
  width: '410px',
  height: 'auto',
  padding: '12px',
  transform: 'translateX(-10px)',
});
export const menuItemStyle = style({
  padding: '4px',
  transition: 'all 0.3s',
});
export const descriptionStyle = style({
  wordWrap: 'break-word',
  fontSize: cssVar('fontXs'),
  lineHeight: '20px',
  color: cssVar('textSecondaryColor'),
  textAlign: 'left',
  padding: '0 6px',
});
export const buttonStyle = style({
  marginTop: '18px',
});
export const actionsStyle = style({
  display: 'flex',
  gap: '9px',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'flex-start',
});
export const containerStyle = style({
  display: 'flex',
  width: '100%',
  flexDirection: 'column',
  gap: '8px',
});
export const indicatorContainerStyle = style({
  position: 'relative',
});
export const inputButtonRowStyle = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  marginTop: '16px',
});
export const titleContainerStyle = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  lineHeight: '22px',
  padding: '0 4px',
});
export const subTitleStyle = style({
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  lineHeight: '22px',
});
export const columnContainerStyle = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  width: '100%',
  gap: '8px',
});
export const rowContainerStyle = style({
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px',
  padding: '4px',
});
export const radioButtonGroup = style({
  display: 'flex',
  justifyContent: 'flex-end',
  padding: '2px',
  minWidth: '154px',
  maxWidth: '250px',
});
export const radioButton = style({
  color: cssVar('textSecondaryColor'),
  selectors: {
    '&[data-state="checked"]': {
      color: cssVar('textPrimaryColor'),
    },
  },
});
export const disableSharePage = style({
  color: cssVar('errorColor'),
});
export const localSharePage = style({
  padding: '12px 8px',
  display: 'flex',
  alignItems: 'center',
  borderRadius: '8px',
  backgroundColor: cssVar('backgroundSecondaryColor'),
  minHeight: '84px',
  position: 'relative',
});
export const cloudSvgContainer = style({
  width: '146px',
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
  position: 'absolute',
  bottom: '0',
  right: '0',
});
export const shareIconStyle = style({
  fontSize: '16px',
  color: cssVar('iconColor'),
  display: 'flex',
  alignItems: 'center',
});
export const shareLinkStyle = style({
  padding: '4px',
  fontSize: cssVar('fontXs'),
  fontWeight: 500,
  lineHeight: '20px',
  transform: 'translateX(-4px)',
  gap: '4px',
});
globalStyle(`${shareLinkStyle} > span`, {
  color: cssVar('linkColor'),
});
globalStyle(`${shareLinkStyle} > div > svg`, {
  color: cssVar('linkColor'),
});
export const shareButton = style({
  height: 32,
  padding: '0px 8px',
});
export const shortcutStyle = style({
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
  fontWeight: 400,
});
