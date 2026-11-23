import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { globalStyle, style } from '@vanilla-extract/css';

export const tabList = style({
  display: 'flex',
  gap: '12px',
  height: '28px',
});
export const tab = style({
  padding: '0px 4px 6px',
});
export const content = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});
export const divider = style({
  borderColor: cssVarV2('tab/divider/divider'),
  margin: '4px 0px',
});
export const menuStyle = style({
  width: '420px',
  maxHeight: '562px',
  padding: '12px',
});
export const localMenuStyle = style({
  width: '420px',
  padding: '12px',
});
export const menuTriggerStyle = style({
  width: '150px',
  padding: '4px 10px',
  justifyContent: 'space-between',
});
export const exportItemStyle = style({
  padding: '4px',
  transition: 'all 0.3s',
  gap: '0px',
});
globalStyle(`${exportItemStyle} > div:first-child`, {
  alignItems: 'center',
});
globalStyle(`${exportItemStyle} svg`, {
  width: '16px',
  height: '16px',
});

export const descriptionStyle = style({
  wordWrap: 'break-word',
  fontSize: cssVar('fontXs'),
  lineHeight: '20px',
  color: cssVarV2('text/secondary'),
  textAlign: 'left',
  padding: '0 6px',
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
export const columnContainerStyle = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  width: '100%',
  gap: '8px',
});
export const memberRowsStyle = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: '8px',
  margin: '6px 0px',
});
export const exportContainerStyle = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});
export const labelStyle = style({
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
});
export const disableSharePage = style({
  color: cssVarV2('button/error'),
});
export const localSharePage = style({
  padding: '12px 8px',
  display: 'flex',
  alignItems: 'center',
  borderRadius: '8px',
  backgroundColor: cssVarV2('layer/background/secondary'),
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
export const shareLinkStyle = style({
  padding: '4px',
  fontSize: cssVar('fontXs'),
  fontWeight: 500,
  lineHeight: '20px',
  transform: 'translateX(-4px)',
  gap: '4px',
});
globalStyle(`${shareLinkStyle} > span`, {
  color: cssVarV2('text/link'),
});
globalStyle(`${shareLinkStyle} > div > svg`, {
  color: cssVarV2('text/link'),
});
export const buttonContainer = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  fontWeight: 500,
});
export const button = style({
  padding: '6px 8px',
  height: 32,
});
export const shortcutStyle = style({
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
  fontWeight: 400,
});

export const generalAccessStyle = style({
  padding: '3px 4px',
  fontSize: cssVar('fontSm'),
  color: cssVarV2('text/secondary'),
  fontWeight: 500,
  height: '30px',
});
