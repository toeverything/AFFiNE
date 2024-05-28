import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const container = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 12px 8px 8px',
  position: 'fixed',
  right: '28px',
  top: '80px',
  borderRadius: '8px',
  boxShadow: cssVar('shadow3'),
  border: `0.5px solid ${cssVar('borderColor')}`,
});

export const leftContent = style({
  display: 'flex',
  alignItems: 'center',
  flex: 1,
});

export const searchIcon = style({
  fontSize: '20px',
  color: cssVar('iconColor'),
  verticalAlign: 'middle',
});

export const inputContainer = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flex: 1,
  height: '32px',
  position: 'relative',
  padding: '0 8px',
  borderRadius: '4px',
  background: cssVar('white10'),
  border: `1px solid ${cssVar('borderColor')}`,
  selectors: {
    '&.active': {
      borderColor: cssVar('primaryColor'),
    },
  },
});
export const inputMain = style({
  display: 'flex',
  alignItems: 'center',
  flex: 1,
  height: '32px',
  position: 'relative',
});

export const input = style({
  position: 'absolute',
  padding: '0',
  inset: 0,
  height: '100%',
  width: '100%',
  color: 'transparent',
});

export const inputHack = style([
  input,
  {
    '::placeholder': {
      color: cssVar('textPrimaryColor'),
    },
    pointerEvents: 'none',
  },
]);

export const count = style({
  color: cssVar('textSecondaryColor'),
  fontSize: cssVar('fontXs'),
  userSelect: 'none',
});

export const arrowButton = style({
  padding: '4px',
  fontSize: '24px',
  width: '32px',
  height: '32px',
  flexShrink: 0,
  border: '1px solid',
  borderColor: cssVar('borderColor'),
  color: cssVar('iconSecondary'),
  alignItems: 'baseline',
  background: 'transparent',
  selectors: {
    '&:hover': {
      color: cssVar('iconColor'),
    },
    '&.backward': {
      marginLeft: '8px',
      borderRadius: '4px 0 0 4px',
    },
    '&.forward': {
      borderLeft: 'none',
      borderRadius: '0 4px 4px 0',
    },
  },
});
export const closeButton = style({
  padding: '4px',
  fontSize: '20px',
  width: '24px',
  height: '24px',
  flexShrink: 0,
  color: cssVar('iconColor'),
  marginLeft: '8px',
});
