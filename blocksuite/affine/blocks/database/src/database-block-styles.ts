import { css } from '@emotion/css';
import { cssVarV2 } from '@toeverything/theme/v2';

export const databaseBlockStyles = css({
  display: 'block',
  borderRadius: '8px',
  backgroundColor: 'var(--affine-background-primary-color)',
  padding: '8px',
  margin: '8px -8px -8px',
});

export const databaseBlockSelectedStyles = css({
  backgroundColor: 'var(--affine-hover-color)',
  borderRadius: '4px',
});

export const databaseOpsStyles = css({
  padding: '2px',
  borderRadius: '4px',
  display: 'flex',
  cursor: 'pointer',
  alignItems: 'center',
  height: 'max-content',
  fontSize: '16px',
  color: cssVarV2.icon.primary,
  ':hover': {
    backgroundColor: 'var(--affine-hover-color)',
  },

  '@media print': {
    display: 'none',
  },
});

export const databaseHeaderBarStyles = css({
  '@media print': {
    display: 'none !important',
  },
});

export const databaseTitleStyles = css({
  overflow: 'hidden',
});

export const databaseHeaderContainerStyles = css({
  marginBottom: '16px',
  display: 'flex',
  flexDirection: 'column',
});

export const databaseTitleRowStyles = css({
  display: 'flex',
  gap: '12px',
  marginBottom: '8px',
  alignItems: 'center',
});

export const databaseToolbarRowStyles = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
});

export const databaseViewBarContainerStyles = css({
  flex: 1,
});

export const databaseContentStyles = css({
  position: 'relative',
  backgroundColor: 'var(--affine-background-primary-color)',
  borderRadius: '4px',
});
