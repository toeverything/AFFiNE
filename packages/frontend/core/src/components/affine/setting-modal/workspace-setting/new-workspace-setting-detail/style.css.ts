import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';
export const profileWrapper = style({
  display: 'flex',
  alignItems: 'flex-end',
  marginTop: '12px',
});
export const profileHandlerWrapper = style({
  flexGrow: '1',
  display: 'flex',
  alignItems: 'center',
  marginLeft: '20px',
});
export const labelWrapper = style({
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  marginTop: '24px',
  gap: '10px',
  flexWrap: 'wrap',
});
export const avatarWrapper = style({
  width: '56px',
  height: '56px',
  borderRadius: '50%',
  position: 'relative',
  cursor: 'pointer',
  flexShrink: '0',
  selectors: {
    '&.disable': {
      cursor: 'default',
      pointerEvents: 'none',
    },
  },
});
globalStyle(`${avatarWrapper}:hover .camera-icon-wrapper`, {
  display: 'flex',
});
globalStyle(`${avatarWrapper}:hover .camera-icon-wrapper`, {
  display: 'flex',
});
globalStyle(`${avatarWrapper} .camera-icon-wrapper`, {
  width: '56px',
  height: '56px',
  borderRadius: '50%',
  position: 'absolute',
  display: 'none',
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: 'rgba(60, 61, 63, 0.5)',
  zIndex: '1',
  color: cssVar('white'),
  fontSize: '24px',
});
export const urlButton = style({
  width: 'calc(100% - 64px - 15px)',
  justifyContent: 'left',
  textAlign: 'left',
});
globalStyle(`${urlButton} span`, {
  width: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: cssVar('placeholderColor'),
  fontWeight: '500',
});
export const fakeWrapper = style({
  position: 'relative',
  opacity: 0.4,
  marginTop: '24px',
  selectors: {
    '&::after': {
      content: '""',
      width: '100%',
      height: '100%',
      position: 'absolute',
      left: 0,
      top: 0,
      cursor: 'not-allowed',
    },
  },
});
export const membersFallback = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flexStart',
  color: cssVar('textSecondaryColor'),
  gap: '4px',
  padding: '8px',
  fontSize: cssVar('fontXs'),
});
export const membersPanel = style({
  padding: '4px',
  borderRadius: '12px',
  background: cssVar('backgroundPrimaryColor'),
  border: `1px solid ${cssVar('borderColor')}`,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
});
export const memberList = style({});
export const memberListItem = style({
  padding: '0 4px 0 16px',
  height: '58px',
  display: 'flex',
  width: '100%',
  alignItems: 'center',
  selectors: {
    '&:hover': {
      background: cssVar('hoverColor'),
      borderRadius: '8px',
    },
    '&:not(:last-of-type)': {
      marginBottom: '6px',
    },
  },
});
export const memberContainer = style({
  width: '250px',
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
  marginLeft: '12px',
  marginRight: '20px',
});
export const roleOrStatus = style({
  // width: '20%',
  flexGrow: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: cssVar('fontSm'),
  selectors: {
    '&.pending': {
      color: cssVar('primaryColor'),
    },
  },
});
export const memberName = style({
  fontSize: cssVar('fontSm'),
  color: cssVar('textPrimaryColor'),
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  lineHeight: '22px',
});
export const memberEmail = style({
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  lineHeight: '20px',
});
export const iconButton = style({});
globalStyle(`${memberListItem}:hover ${iconButton}`, {
  opacity: 1,
  pointerEvents: 'all',
});
export const label = style({
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
  marginBottom: '5px',
});
export const workspaceLabel = style({
  width: '100%',
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  alignItems: 'center',
  borderRadius: '6px',
  padding: '2px 10px',
  border: `1px solid ${cssVar('white30')}`,
  fontSize: cssVar('fontXs'),
  color: cssVar('textPrimaryColor'),
  lineHeight: '20px',
  whiteSpace: 'nowrap',
});
export const goUpgrade = style({
  fontSize: cssVar('fontXs'),
  color: cssVar('textEmphasisColor'),
  cursor: 'pointer',
  marginLeft: '4px',
  display: 'inline',
});
export const goUpgradeWrapper = style({
  display: 'inline-flex',
  alignItems: 'center',
});
export const arrowRight = style({
  fontSize: '16px',
  color: cssVar('textEmphasisColor'),
  cursor: 'pointer',
});
