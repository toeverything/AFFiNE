import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { globalStyle, style } from '@vanilla-extract/css';

export const container = style({
  width: '100%',
  maxWidth: cssVar('--affine-editor-width'),
  marginLeft: 'auto',
  marginRight: 'auto',
  paddingLeft: cssVar('--affine-editor-side-padding', '24'),
  paddingRight: cssVar('--affine-editor-side-padding', '24'),
  fontSize: cssVar('--affine-font-base'),
  '@container': {
    [`viewport (width <= 640px)`]: {
      padding: '0 24px',
    },
  },
  '@media': {
    print: {
      display: 'none',
    },
  },
});

export const titleLine = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});

export const title = style({
  fontWeight: 500,
  fontSize: '15px',
  lineHeight: '24px',
  color: cssVar('--affine-text-primary-color'),
});

export const showButton = style({
  height: '28px',
  borderRadius: '8px',
  border: '1px solid ' + cssVar('--affine-border-color'),
  backgroundColor: cssVarV2('button/secondary'),
  textAlign: 'center',
  fontSize: '12px',
  lineHeight: '28px',
  fontWeight: '500',
  color: cssVar('--affine-text-primary-color'),
  cursor: 'pointer',
});

export const linksContainer = style({
  marginBottom: '16px',
});

export const linksTitles = style({
  color: cssVar('--affine-text-secondary-color'),
  height: '32px',
  lineHeight: '32px',
});

export const link = style({
  width: '100%',
  height: '30px',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  whiteSpace: 'nowrap',
  borderRadius: '4px',
  ':hover': {
    backgroundColor: cssVarV2('layer/background/hoverOverlay'),
  },
});

globalStyle(`${link} .affine-reference-title`, {
  borderBottom: 'none',
});

globalStyle(`${link} svg`, {
  color: cssVarV2('icon/secondary'),
});

globalStyle(`${link}:hover svg`, {
  color: cssVarV2('icon/primary'),
});

export const linkPreviewContainer = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  marginTop: '4px',
  marginBottom: '16px',
});

export const linkPreview = style({
  cursor: 'default',
  border: `0.5px solid ${cssVarV2('backlinks/blockBorder')}`,
  borderRadius: '8px',
  padding: '8px',
  color: cssVarV2('text/primary'),
  vars: {
    [cssVar('fontFamily')]: cssVar('fontSansFamily'),
  },
  backgroundColor: cssVarV2('backlinks/blockBackgroundColor'),
  ':hover': {
    backgroundColor: cssVarV2('backlinks/blockHover'),
  },
});

globalStyle(`${linkPreview} *`, {
  cursor: 'default',
});

export const notFound = style({
  color: cssVarV2('text/secondary'),
  fontSize: '12px',
  lineHeight: '16px',
  textAlign: 'center',
});

export const linkPreviewRenderer = style({
  cursor: 'pointer',
});

export const collapsedIcon = style({
  transition: 'all 0.2s ease-in-out',
  color: cssVarV2('icon/primary'),
  fontSize: 20,
  selectors: {
    '&[data-collapsed="true"]': {
      transform: 'rotate(90deg)',
      color: cssVarV2('icon/secondary'),
    },
  },
});
