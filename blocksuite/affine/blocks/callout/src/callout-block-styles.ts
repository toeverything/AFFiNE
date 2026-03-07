import { css } from '@emotion/css';

export const calloutHostStyles = css({
  display: 'block',
  margin: '8px 0',
});

export const calloutBlockContainerStyles = css({
  display: 'flex',
  alignItems: 'flex-start',
  padding: '5px 10px',
  borderRadius: '8px',
  /* T079: In forced-colors mode the background is overridden by the system.
   * Add a border so the callout boundary remains perceivable (WCAG SC 1.4.11). */
  '@media (forced-colors: active)': {
    border: '1px solid ButtonText',
  },
});

export const calloutEmojiContainerStyles = css({
  userSelect: 'none',
  fontSize: '1.2em',
  width: '24px',
  height: '24px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  // marginTop is dynamically set by JavaScript based on first child's height
  marginBottom: '10px',
  flexShrink: 0,
  position: 'relative',
});

export const calloutEmojiStyles = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  ':hover': {
    cursor: 'pointer',
    opacity: 0.7,
  },
});

export const calloutChildrenStyles = css({
  flex: 1,
  minWidth: 0,
  paddingLeft: '10px',
});

/**
 * Fold/expand toggle button (T036, FR-050a, T080).
 * Respects prefers-reduced-motion per FR-053.
 * Touch target: min 24×24px floor per FR-055.
 */
export const calloutFoldButtonStyles = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'none',
  border: 'none',
  padding: '4px',
  minWidth: 24 /* T080: touch target floor */,
  minHeight: 24 /* T080: touch target floor */,
  fontSize: '0.7em',
  cursor: 'pointer',
  color: 'inherit',
  opacity: 0.6,
  flexShrink: 0,
  userSelect: 'none',
  ':hover': {
    opacity: 1,
  },
});

export const iconPickerContainerStyles = css({
  position: 'absolute',
  top: '100%',
  left: 0,
  zIndex: 1000,
  background: 'white',
  border: '1px solid #ccc',
  borderRadius: '8px',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
  width: '390px',
  height: '400px',
});
