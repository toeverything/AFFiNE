import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';
export const link = style({
  height: '18px',
  display: 'flex',
  alignItems: 'center',
  color: cssVar('textPrimaryColor'),
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
  marginBottom: '12px',
  selectors: {
    '&:last-of-type': {
      marginBottom: '0',
    },
  },
});
globalStyle(`${link} .icon`, {
  color: cssVar('iconColor'),
  fontSize: cssVar('fontBase'),
  marginLeft: '5px',
});
export const communityWrapper = style({
  display: 'grid',
  gridTemplateColumns: '15% 15% 15% 15% 15% 15%',
  gap: '2%',
});
export const communityItem = style({
  borderRadius: '8px',
  border: `1px solid ${cssVar('borderColor')}`,
  color: cssVar('textPrimaryColor'),
  cursor: 'pointer',
  padding: '6px 8px',
});
globalStyle(`${communityItem} svg`, {
  width: '24px',
  height: '24px',
  display: 'block',
  margin: '0 auto 2px',
});
globalStyle(`${communityItem} p`, {
  fontSize: cssVar('fontXs'),
  textAlign: 'center',
});
export const checkUpdateDesc = style({
  color: cssVar('textSecondaryColor'),
  fontSize: cssVar('fontXs'),
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  selectors: {
    '&.active': {
      color: cssVar('textEmphasisColor'),
    },
    '&.error': {
      color: cssVar('errorColor'),
    },
  },
});
globalStyle(`${checkUpdateDesc} svg`, {
  marginRight: '4px',
});
export const appImageRow = style({
  flexDirection: 'row-reverse',
  selectors: {
    '&.two-col': {
      justifyContent: 'flex-end',
    },
  },
});
globalStyle(`${appImageRow} .right-col`, {
  paddingLeft: '0',
  paddingRight: '20px',
});
export const snapshotImportExportRow = style({
  marginTop: '12px',
});
