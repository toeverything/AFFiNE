import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { globalStyle, style } from '@vanilla-extract/css';
export const profileWrapper = style({
  display: 'flex',
  alignItems: 'flex-end',
  marginTop: '12px',
});

export const labelWrapper = style({
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  marginTop: '24px',
  gap: '10px',
  flexWrap: 'wrap',
});

export const label = style({
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
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
  color: cssVarV2('text/primary'),
  lineHeight: '20px',
  whiteSpace: 'nowrap',
});

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
