import { css } from '@emotion/css';
import { baseTheme } from '@toeverything/theme';

export const progressCellStyle = css({
  display: 'block',
  width: '100%',
  padding: '0 4px',
  userSelect: 'none',
});

export const progressContainerStyle = css({
  display: 'flex',
  alignItems: 'center',
  height: 'var(--data-view-cell-text-line-height)',
  gap: '4px',
});

export const progressBarStyle = css({
  position: 'relative',
  width: '100%',
});

export const progressBgStyle = css({
  overflow: 'hidden',
  width: '100%',
  height: '10px',
  borderRadius: '22px',
});

export const progressFgStyle = css({
  height: '100%',
});

export const progressDragHandleStyle = css({
  position: 'absolute',
  top: '0',
  left: '0',
  transform: 'translate(0px, -1px)',
  width: '6px',
  height: '12px',
  borderRadius: '2px',
  opacity: '1',
  cursor: 'ew-resize',
  background: 'var(--affine-primary-color)',
  transition: 'opacity 0.2s ease-in-out',
});

export const progressNumberStyle = css({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '18px',
  width: '25px',
  color: 'var(--affine-text-secondary-color)',
  fontSize: '14px',
  fontFamily: baseTheme.fontSansFamily,
});
