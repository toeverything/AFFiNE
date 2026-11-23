import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export { viewer } from '../viewer.css';

export const virtuoso = style({
  width: '100%',
});

export const pdfIndicator = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 12px',
});

export const pdfPage = style({
  maxWidth: 'calc(100% - 40px)',
  background: cssVarV2('layer/white'),
  boxSizing: 'border-box',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: cssVarV2('layer/insideBorder/border'),
  boxShadow:
    '0px 4px 20px 0px var(--transparent-black-200, rgba(0, 0, 0, 0.10))',
  overflow: 'hidden',
  maxHeight: 'max-content',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const pdfThumbnails = style({
  display: 'flex',
  flexDirection: 'column',
  position: 'absolute',
  boxSizing: 'border-box',
  width: '120px',
  padding: '12px 0',
  right: '30px',
  bottom: '30px',
  maxHeight: 'calc(100% - 60px)',
  borderRadius: '8px',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: cssVarV2('layer/insideBorder/border'),
  backgroundColor: cssVarV2('layer/background/primary'),
  fontSize: '12px',
  fontWeight: 500,
  lineHeight: '20px',
  color: cssVarV2('text/secondary'),
});

export const pdfThumbnailsList = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '100%',
  overflow: 'hidden',
  selectors: {
    '&.collapsed': {
      display: 'none',
    },
    '&:not(.collapsed)': {
      marginBottom: '8px',
    },
  },
});

export const pdfThumbnail = style({
  display: 'flex',
  overflow: 'hidden',
  // width: '100%',
  borderRadius: '4px',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: cssVarV2('layer/insideBorder/border'),
  selectors: {
    '&.selected': {
      borderColor: '#29A3FA',
    },
  },
});

export const pdfContainer = style({
  width: '100%',
  borderRadius: '8px',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: cssVarV2('layer/insideBorder/border'),
  background: cssVar('backgroundPrimaryColor'),
  userSelect: 'none',
  contentVisibility: 'visible',
  display: 'flex',
  minHeight: 'fit-content',
  height: '100%',
  flexDirection: 'column',
  justifyContent: 'space-between',
});

export const pdfViewer = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '12px',
  overflow: 'hidden',
  background: cssVarV2('layer/background/secondary'),
  flex: 1,
});

export const pdfPlaceholder = style({
  position: 'absolute',
  maxWidth: 'calc(100% - 24px)',
  overflow: 'hidden',
  height: 'auto',
  pointerEvents: 'none',
});

export const pdfControls = style({
  position: 'absolute',
  bottom: '16px',
  right: '14px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
});

export const pdfControlButton = style({
  width: '36px',
  height: '36px',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: cssVar('borderColor'),
  background: cssVar('white'),
});

export const pdfFooter = style({
  display: 'flex',
  alignItems: 'center',
  flexDirection: 'row',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '12px',
  textWrap: 'nowrap',
});

export const pdfFooterItem = style({
  display: 'flex',
  alignItems: 'center',
  selectors: {
    '&.truncate': {
      overflow: 'hidden',
    },
  },
});

export const pdfTitle = style({
  marginLeft: '8px',
  fontSize: '14px',
  fontWeight: 600,
  lineHeight: '22px',
  color: cssVarV2('text/primary'),
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const pdfPageCount = style({
  fontSize: '12px',
  fontWeight: 400,
  lineHeight: '20px',
  color: cssVarV2('text/secondary'),
});

export const pdfLoadingWrapper = style({
  margin: 'auto',
});

export const pdfStatus = style({
  position: 'absolute',
  left: '18px',
  bottom: '18px',
});

export const pdfStatusButton = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px',
  borderRadius: '50%',
  fontSize: '18px',
  outline: 'none',
  border: 'none',
  cursor: 'pointer',
  color: cssVarV2('button/pureWhiteText'),
  background: cssVarV2('status/error'),
  boxShadow: cssVar('overlayShadow'),
});

export const pdfStatusMenu = style({
  width: '244px',
  gap: '8px',
  color: cssVarV2('text/primary'),
  lineHeight: '22px',
});

export const pdfStatusMenuFooter = style({
  display: 'flex',
  justifyContent: 'flex-end',
});

export const pdfReloadButton = style({
  display: 'flex',
  alignItems: 'center',
  padding: '2px 12px',
  borderRadius: '8px',
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  outline: 'none',
  color: cssVarV2('button/primary'),
});
