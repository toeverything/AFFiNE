import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const header = style({
  width: '100%',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 16px',
  borderBottom: `1px solid ${cssVar('borderColor')}`,
  gap: 8,
  position: 'sticky',
  backgroundColor: cssVar('backgroundPrimaryColor'),
  zIndex: 2,
});

export const logo = style({
  fontSize: 32,
  cursor: 'pointer',
});

export const title = style({
  fontSize: cssVar('fontH3'),
  fontWeight: 'bold',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  whiteSpace: 'pre-wrap',
  textAlign: 'center',
  justifyContent: 'center',
});

export const outLine = style({
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  flexWrap: 'wrap',
});

export const outLineHeader = style({
  display: 'flex',
  width: '100%',
  cursor: 'pointer',
  alignItems: 'center',
  wordBreak: 'break-all',
  wordWrap: 'break-word',
  fontSize: cssVar('fontBase'),
  fontWeight: 'bold',
  textTransform: 'capitalize',
  ':hover': {
    backgroundColor: cssVar('hoverColor'),
  },
  selectors: {
    '&[data-active=true]': {
      background: cssVar('hoverColor'),
    },
  },
  color: cssVar('textPrimaryColor'),
  borderRadius: 4,
  padding: 4,
  marginBottom: 4,
  ':visited': {
    color: cssVar('textPrimaryColor'),
  },
});

export const arrowIcon = style({
  transform: 'rotate(-90deg)',
  selectors: {
    '&[data-open=true]': {
      transform: 'rotate(0deg) translateY(3px) translateX(-3px)',
    },
  },
  transition: 'transform 0.2s',
});

export const collapsibleContainer = style({
  display: 'flex',
  width: '100%',
  flexDirection: 'column',
  wordBreak: 'break-all',
  wordWrap: 'break-word',
});

export const outLineContent = style({
  fontSize: cssVar('fontSm'),
  cursor: 'pointer',
  borderRadius: 4,
  padding: '4px 18px',
  color: cssVar('textPrimaryColor'),
  textTransform: 'capitalize',
  ':hover': {
    backgroundColor: cssVar('hoverColor'),
  },
});

export const navText = style({
  width: '100%',
  color: cssVar('textPrimaryColor'),
  padding: '4px 0px',
  ':visited': {
    color: cssVar('textPrimaryColor'),
  },
});

export const settingItem = style({
  maxWidth: '960px',
  minHeight: '100px',
  display: 'flex',
  gap: 8,
  padding: '16px 0',
  borderBottom: `0.5px solid ${cssVar('borderColor')}`,
});

export const LeftItem = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  width: '60%',
});

export const RightItem = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  fontSize: cssVar('fontXs'),
  color: cssVar('textPrimaryColor'),
  width: '40%',
  alignItems: 'flex-end',
});

export const settingItemTitle = style({
  fontSize: cssVar('fontBase'),
  fontWeight: 'bold',
  wordBreak: 'break-all',
  wordWrap: 'break-word',
  marginBottom: 6,
});

export const settingItemId = style({
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
  borderRadius: 4,
  borderColor: cssVar('borderColor'),
  backgroundColor: cssVar('backgroundSecondaryColor'),
  padding: '2px 4px',
  wordBreak: 'keep-all',
});

export const settingItemDescription = style({
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
});

export const changedValues = style({
  background: cssVar('backgroundSecondaryColor'),
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minHeight: '64px',
  borderRadius: 4,
  padding: '12px 16px 16px 12px',
  marginTop: 8,
  overflow: 'hidden',
  color: cssVar('textPrimaryColor'),
  fontSize: cssVar('fontSm'),
});

export const expiredValue = style({
  color: cssVar('textHighlightForegroundRed'),
  background: cssVar('textHighlightRed'),
  textDecoration: 'line-through',
  marginRight: 2,
});

export const newValue = style({
  color: cssVar('textHighlightForegroundGreen'),
  background: cssVar('textHighlightGreen'),
});
