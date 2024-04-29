import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';
export const settingHeader = style({
  borderBottom: `1px solid ${cssVar('borderColor')}`,
  paddingBottom: '16px',
  marginBottom: '24px',
});
globalStyle(`${settingHeader} .title`, {
  fontSize: cssVar('fontBase'),
  fontWeight: 600,
  lineHeight: '24px',
});
globalStyle(`${settingHeader} .subtitle`, {
  paddingTop: '4px',
  paddingBottom: '8px',
  fontSize: cssVar('fontXs'),
  lineHeight: '16px',
  color: cssVar('textSecondaryColor'),
});
export const wrapper = style({
  borderBottom: `1px solid ${cssVar('borderColor')}`,
  paddingBottom: '24px',
  marginBottom: '24px',
  selectors: {
    '&:last-of-type': {
      borderBottom: 'none',
      paddingBottom: '0',
      marginBottom: '0',
    },
  },
});
globalStyle(`${wrapper} .title`, {
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
  lineHeight: '18px',
  color: cssVar('textSecondaryColor'),
  marginBottom: '16px',
});
export const settingRow = style({
  marginBottom: '25px',
  color: cssVar('textPrimaryColor'),
  borderRadius: '8px',
  selectors: {
    '&.two-col': {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    '&:last-of-type': {
      marginBottom: '0',
    },
    '&.disabled': {
      position: 'relative',
    },
    '&.disabled::after': {
      content: '',
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(255,255,255,0.5)',
    },
  },
});
globalStyle(`${settingRow} .left-col`, {
  flex: 1,
  maxWidth: '100%',
});
globalStyle(`${settingRow}.two-col .left-col`, {
  flexShrink: 0,
  maxWidth: '80%',
});
globalStyle(`${settingRow} .name`, {
  marginBottom: '2px',
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
});
globalStyle(`${settingRow} .desc`, {
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
});
globalStyle(`${settingRow} .right-col`, {
  display: 'flex',
  justifyContent: 'flex-end',
  paddingLeft: '15px',
  flexShrink: 0,
});
