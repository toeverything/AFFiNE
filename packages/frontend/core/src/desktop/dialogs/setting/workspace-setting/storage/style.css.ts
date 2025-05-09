import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { globalStyle, style } from '@vanilla-extract/css';

export const storageProgressContainer = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});
export const storageProgressWrapper = style({
  flexGrow: 1,
});
globalStyle(`${storageProgressWrapper} .storage-progress-desc`, {
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
  height: '20px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 2,
});
globalStyle(`${storageProgressWrapper} .storage-progress-bar-wrapper`, {
  height: '8px',
  borderRadius: '4px',
  backgroundColor: cssVarV2('layer/background/hoverOverlay'),
  overflow: 'hidden',
});
export const storageProgressBar = style({
  height: '100%',
});

// blob management

// when no blob is selected
export const blobManagementControls = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
});

export const spacer = style({
  flexGrow: 1,
});

export const blobManagementName = style({
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
  height: '28px',
});

export const blobManagementNameInactive = style([
  blobManagementName,
  {
    color: cssVarV2('text/secondary'),
  },
]);

export const blobManagementContainer = style({
  marginTop: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  padding: '12px',
  borderRadius: '8px',
  background: cssVarV2('layer/background/primary'),
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
});

export const blobPreviewGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(30%, 1fr))',
  gap: '12px',
});

export const blobCard = style({
  borderRadius: '4px',
  overflow: 'hidden',
  position: 'relative',
  userSelect: 'none',
});

export const loadingContainer = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '320px',
});

export const empty = style({
  paddingTop: '64px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: cssVarV2('text/secondary'),
  fontSize: cssVar('fontSm'),
});

export const blobPreviewContainer = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  gap: 8,
});

export const blobPreview = style({
  width: '100%',
  overflow: 'hidden',
  aspectRatio: '1',
  borderRadius: '4px',
  padding: 6,
  backgroundColor: cssVarV2('layer/background/secondary'),
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  border: `2px solid transparent`,
  selectors: {
    [`${blobCard}[data-selected="true"] &`]: {
      borderColor: cssVarV2('button/primary'),
    },
    [`${blobCard}:hover &`]: {
      backgroundColor: cssVarV2('layer/background/hoverOverlay'),
    },
  },
});

export const blobGridItemCheckbox = style({
  position: 'absolute',
  top: 8,
  right: 8,
  fontSize: 24,
  opacity: 0,
  selectors: {
    [`${blobCard}:hover &`]: {
      opacity: 1,
    },
    [`${blobCard}[data-selected="true"] &`]: {
      opacity: 1,
    },
  },
});

globalStyle(`${blobGridItemCheckbox} path`, {
  backgroundColor: cssVarV2('layer/background/primary'),
});

export const blobImagePreview = style({
  width: '100%',
  height: '100%',
  objectFit: 'contain',
});

export const unknownBlobIcon = style({});

export const blobPreviewFooter = style({
  fontSize: cssVar('fontXs'),
  width: '100%',
});

export const blobPreviewName = style({
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '100%',
});

export const blobPreviewInfo = style({
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
});
