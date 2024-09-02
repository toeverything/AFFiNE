import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
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
export const content = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});
export const menuStyle = style({
  width: '390px',
  height: 'auto',
  padding: '12px',
});
export const menuTriggerStyle = style({
  width: '150px',
  padding: '4px 10px',
  justifyContent: 'space-between',
});
export const publicItemRowStyle = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
});
export const DoneIconStyle = style({
  color: cssVarV2('button/primary'),
  fontSize: cssVar('fontH5'),
  marginLeft: '8px',
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

export const copyLinkContainerStyle = style({
  padding: '4px',
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  position: 'relative',
});
export const copyLinkButtonStyle = style({
  flex: 1,
  padding: '4px 12px',
  paddingRight: '6px',
  borderRight: 'none',
  borderTopRightRadius: '0',
  borderBottomRightRadius: '0',
  color: 'transparent',
  position: 'initial',
});
export const copyLinkLabelContainerStyle = style({
  width: '100%',
  borderRight: 'none',
  borderTopRightRadius: '0',
  borderBottomRightRadius: '0',
  position: 'relative',
});
export const copyLinkLabelStyle = style({
  position: 'absolute',
  textAlign: 'end',
  top: '50%',
  left: '50%',
  transform: 'translateX(-50%) translateY(-50%)',
  lineHeight: '20px',
  color: cssVarV2('text/pureWhite'),
});
export const copyLinkShortcutStyle = style({
  position: 'absolute',
  textAlign: 'end',
  top: '50%',
  right: '52px',
  transform: 'translateY(-50%)',
  opacity: 0.5,
  lineHeight: '20px',
  color: cssVarV2('text/pureWhite'),
});
export const copyLinkTriggerStyle = style({
  padding: '4px 12px 4px 8px',
  borderLeft: 'none',
  borderTopLeftRadius: '0',
  borderBottomLeftRadius: '0',
  ':hover': {
    backgroundColor: cssVarV2('button/primary'),
    color: cssVarV2('button/pureWhiteText'),
  },
  '::after': {
    content: '""',
    position: 'absolute',
    left: '0',
    top: '0',
    height: '100%',
    width: '1px',
    backgroundColor: cssVarV2('button/innerBlackBorder'),
  },
});
globalStyle(`${copyLinkTriggerStyle} svg`, {
  color: cssVarV2('button/pureWhiteText'),
  transform: 'translateX(2px)',
});
export const copyLinkMenuItemStyle = style({
  padding: '4px',
  transition: 'all 0.3s',
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
export const titleContainerStyle = style({
  display: 'flex',
  alignItems: 'center',
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
  fontWeight: 400,
  padding: '8px 4px 0 4px',
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
  padding: '4px',
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
export const openWorkspaceSettingsStyle = style({
  color: cssVarV2('text/link'),
  fontSize: cssVar('fontXs'),
  fontWeight: 500,
  display: 'flex',
  gap: '8px',
  alignItems: 'center',
  justifyContent: 'flex-start',
  width: '100%',
  padding: '4px',
  cursor: 'pointer',
});
globalStyle(`${openWorkspaceSettingsStyle} svg`, {
  color: cssVarV2('text/link'),
});
