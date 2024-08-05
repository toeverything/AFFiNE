import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';

export const storageProgressContainer = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});
export const storageProgressWrapper = style({
  flexGrow: 1,
  marginRight: '20px',
});
globalStyle(`${storageProgressWrapper} .storage-progress-desc`, {
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
  height: '20px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 2,
});
globalStyle(`${storageProgressWrapper} .storage-progress-bar-wrapper`, {
  height: '8px',
  borderRadius: '4px',
  backgroundColor: cssVar('black10'),
  overflow: 'hidden',
});
export const storageProgressBar = style({
  height: '100%',
});
