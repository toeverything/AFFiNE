import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

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
  color: cssVarV2('aI/errorText'),
});
