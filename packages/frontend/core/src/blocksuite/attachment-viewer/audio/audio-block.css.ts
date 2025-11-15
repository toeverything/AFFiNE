import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { globalStyle, style } from '@vanilla-extract/css';

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  width: '100%',
  height: 'auto',
});

export const notesButton = style({
  padding: '4px 8px',
  color: cssVarV2('icon/primary'),
  fontSize: cssVar('fontXs'),
  fontWeight: 500,
  userSelect: 'none',
});

export const notesButtonIcon = style({
  fontSize: 24,
  width: '1em',
  height: '1em',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const error = style({
  display: 'flex',
  color: cssVarV2('aI/errorText'),
});

export const reloadButton = style({
  display: 'flex',
  alignItems: 'center',
  padding: '0 4px',
  gap: '4px',
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  outline: 'none',
  color: cssVarV2('button/primary'),
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
});

export const reloadButtonIcon = style({
  fontSize: 16,
});

/** Render our own border for audio block  */
globalStyle(`.affine-attachment-container:has(${root})`, {
  border: 'none',
  overflow: 'visible',
});
