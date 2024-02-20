import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';
export const layout = style({
  backgroundColor: cssVar('backgroundPrimaryColor'),
  height: '100vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  selectors: {
    '&[data-is-macos-electron="true"]': {
      margin: '8px',
      borderRadius: '8px',
      height: 'calc(100vh - 16px)',
    },
  },
});
export const header = style({
  paddingTop: '24px',
  paddingRight: '24px',
  position: 'sticky',
  top: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  ['WebkitAppRegion' as string]: 'drag',
  selectors: {
    '&[data-is-windows-electron="true"]': {
      paddingTop: '0',
      paddingRight: '0',
      gap: '16px',
    },
  },
});
export const footer = style({
  padding: '20px',
  position: 'sticky',
  bottom: 0,
  backgroundColor: cssVar('backgroundPrimaryColor'),
});
export const scrollableContainer = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '80px 200px 160px',
  '@media': {
    'screen and (max-width: 1024px)': {
      padding: '0px 36px 80px',
    },
  },
});
export const onboardingContainer = style({
  maxWidth: '600px',
  '@media': {
    'screen and (max-width: 1024px)': {
      padding: '40px 0',
      maxWidth: '100%',
    },
  },
});
export const content = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  gap: '36px',
  minHeight: '450px',
});
export const question = style({
  fontFamily: 'Inter',
  fontSize: cssVar('fontH1'),
  fontStyle: 'normal',
  fontWeight: 600,
  lineHeight: '36px',
});
export const optionsWrapper = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '16px',
  flexGrow: 1,
});
export const buttonWrapper = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'flex-start',
  gap: '24px',
  flexShrink: 0,
});
export const checkBox = style({
  alignItems: 'center',
  fontSize: '24px',
});
globalStyle(`${checkBox} svg`, {
  color: cssVar('brandColor'),
  flexShrink: 0,
  marginRight: '8px',
});
export const label = style({
  fontSize: cssVar('fontBase'),
  fontWeight: 500,
});
export const input = style({
  width: '520px',
  '@media': {
    'screen and (max-width: 768px)': {
      width: '100%',
    },
  },
});
export const button = style({
  fontWeight: 600,
  fontSize: cssVar('fontBase'),
});
export const openAFFiNEButton = style({
  alignSelf: 'flex-start',
});
export const disableButton = style({
  position: 'absolute',
  display: 'none',
  pointerEvents: 'none',
});
export const windowsAppButton = style({
  marginRight: '24px',
});
export const thankContainer = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
});
export const thankTitle = style({
  fontSize: cssVar('fontTitle'),
  fontWeight: '700',
  lineHeight: '44px',
});
export const thankText = style({
  fontSize: cssVar('fontH6'),
  height: '300px',
  fontWeight: '600',
  lineHeight: '26px',
});
export const linkGroup = style({
  display: 'flex',
  fontSize: cssVar('fontXs'),
  height: '16px',
  gap: '6px',
  width: '100%',
  justifyContent: 'flex-end',
  backgroundColor: cssVar('backgroundPrimaryColor'),
});
export const link = style({
  color: cssVar('textSecondaryColor'),
  selectors: {
    '&:visited': {
      color: cssVar('textSecondaryColor'),
    },
  },
});
