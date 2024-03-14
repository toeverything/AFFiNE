import { cssVar } from '@toeverything/theme';
import { createVar, style } from '@vanilla-extract/css';
export const widthVar = createVar('widthVar');
export const heightVar = createVar('heightVar');
export const minHeightVar = createVar('minHeightVar');
export const modalOverlay = style({
  position: 'fixed',
  inset: 0,
  backgroundColor: cssVar('backgroundModalColor'),
  zIndex: cssVar('zIndexModal'),
});
export const modalContentWrapper = style({
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: cssVar('zIndexModal'),
});
export const modalContent = style({
  vars: {
    [widthVar]: '',
    [heightVar]: '',
    [minHeightVar]: '',
  },
  width: widthVar,
  height: heightVar,
  minHeight: minHeightVar,
  boxSizing: 'border-box',
  fontSize: cssVar('fontBase'),
  fontWeight: '400',
  lineHeight: '1.6',
  padding: '20px 24px',
  position: 'relative',
  backgroundColor: cssVar('backgroundOverlayPanelColor'),
  boxShadow: cssVar('popoverShadow'),
  borderRadius: '12px',
  maxHeight: 'calc(100vh - 32px)',
  // :focus-visible will set outline
  outline: 'none',
});
export const closeButton = style({
  position: 'absolute',
  top: '22px',
  right: '20px',
  zIndex: cssVar('zIndexModal'),
});
export const modalHeader = style({
  fontSize: cssVar('fontH6'),
  fontWeight: '600',
  lineHeight: '1.45',
  marginBottom: '12px',
});
export const modalDescription = style({
  // marginBottom: '20px',
});
export const modalFooter = style({
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
  paddingTop: '40px',
  marginTop: 'auto',
  gap: '20px',
  selectors: {
    '&.modalFooterWithChildren': {
      paddingTop: '20px',
    },
  },
});
export const confirmModalContent = style({
  marginTop: '12px',
  marginBottom: '20px',
  height: '100%',
  overflowY: 'auto',
  padding: '0 4px',
});
export const confirmModalContainer = style({
  display: 'flex',
  flexDirection: 'column',
});
