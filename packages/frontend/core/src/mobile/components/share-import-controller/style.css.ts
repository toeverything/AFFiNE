import {
  bodyEmphasized,
  bodyRegular,
  footnoteRegular,
  subHeadlineRegular,
} from '@toeverything/theme/typography';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const page = style({
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  background: cssVarV2('layer/background/secondary'),
});

export const headerTitle = style([
  bodyEmphasized,
  { color: cssVarV2('text/primary') },
]);

export const scrollArea = style({
  height: 0,
  flex: 1,
});

export const main = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
  padding: '20px 16px',
});

export const source = style({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: 12,
  borderRadius: 12,
  background: cssVarV2('layer/background/primary'),
});

export const sourceIcon = style({
  width: 40,
  height: 40,
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
  fontSize: 20,
  color: cssVarV2('icon/primary'),
  background: cssVarV2('layer/background/secondary'),
  overflow: 'hidden',
});

export const sourceImage = style({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
});

export const sourceContent = style({
  minWidth: 0,
  flex: 1,
});

export const sourceTitle = style([
  bodyEmphasized,
  {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: cssVarV2('text/primary'),
  },
]);

export const sourceDetail = style([
  footnoteRegular,
  {
    marginTop: 2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: cssVarV2('text/secondary'),
  },
]);

export const linkPreview = style({
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  borderRadius: 12,
  color: cssVarV2('text/primary'),
  background: cssVarV2('layer/background/primary'),
});

export const previewContent = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: 14,
});

export const previewBody = style({
  minWidth: 0,
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

export const previewSite = style([
  footnoteRegular,
  {
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
    overflow: 'hidden',
    color: cssVarV2('text/secondary'),
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
]);

export const previewFavicon = style({
  width: 16,
  height: 16,
  flex: '0 0 auto',
  objectFit: 'contain',
});

export const previewTitle = style([
  bodyEmphasized,
  {
    display: '-webkit-box',
    overflow: 'hidden',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
  },
]);

export const previewDescription = style([
  {
    fontSize: 14,
    fontWeight: 400,
    lineHeight: '20px',
    display: '-webkit-box',
    overflow: 'hidden',
    color: cssVarV2('text/secondary'),
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
  },
]);

export const previewMeta = style([
  footnoteRegular,
  {
    overflow: 'hidden',
    color: cssVarV2('text/secondary'),
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
]);

export const transcriptPreview = style({
  minWidth: 0,
  marginTop: 8,
  paddingTop: 10,
  borderTop: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
});

export const transcriptLabel = style({
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 13,
  fontWeight: 600,
  lineHeight: '18px',
  color: cssVarV2('text/secondary'),
});

export const transcriptIcon = style({
  width: 16,
  height: 16,
  flex: '0 0 auto',
});

const transcriptExcerptBase = {
  minWidth: 0,
  marginTop: 4,
  display: '-webkit-box',
  overflow: 'hidden',
  fontSize: 14,
  fontWeight: 400,
  lineHeight: '20px',
  color: cssVarV2('text/secondary'),
  WebkitBoxOrient: 'vertical' as const,
};

export const transcriptExcerpt = style({
  ...transcriptExcerptBase,
  WebkitLineClamp: 3,
});

export const transcriptExcerptWithSelectedText = style({
  ...transcriptExcerptBase,
  WebkitLineClamp: 2,
});

export const previewMedia = style({
  width: '100%',
  maxHeight: 180,
  aspectRatio: '16 / 9',
  objectFit: 'cover',
});

export const previewMediaPlaceholder = style({
  width: '100%',
  maxHeight: 180,
  aspectRatio: '16 / 9',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 24,
  color: cssVarV2('icon/tertiary'),
  background: cssVarV2('layer/background/secondary'),
});

export const previewFallbackIcon = style({
  width: 40,
  height: 40,
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
  color: cssVarV2('icon/primary'),
  background: cssVarV2('layer/background/secondary'),
});

export const previewFallbackRow = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
});

export const previewMediaSkeleton = style({
  width: '100%',
  maxHeight: 180,
  aspectRatio: '16 / 9',
  background: cssVarV2('layer/background/secondary'),
});

export const previewSkeletonContent = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 14,
});

const skeletonLine = {
  height: 12,
  borderRadius: 6,
  background: cssVarV2('layer/background/secondary'),
};

export const previewSkeletonSite = style({ ...skeletonLine, width: '60%' });

export const previewSkeletonTitle = style({
  ...skeletonLine,
  width: '90%',
  height: 16,
});

export const previewSkeletonDescription = style({
  ...skeletonLine,
  width: '55%',
});

export const selectedText = style([
  footnoteRegular,
  {
    width: '100%',
    margin: 0,
    padding: '12px 14px 14px',
    display: '-webkit-box',
    overflow: 'hidden',
    borderTop: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
    color: cssVarV2('text/secondary'),
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 3,
  },
]);

export const selectedTextLabel = style({
  display: 'block',
  color: cssVarV2('text/primary'),
  fontWeight: 600,
});

export const srOnly = style({
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
});

export const destinationGroup = style({
  overflow: 'hidden',
  borderRadius: 12,
  background: cssVarV2('layer/background/primary'),
});

export const destinationRow = style({
  width: '100%',
  minHeight: 52,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '0 12px',
  border: 0,
  borderBottom: `0.5px solid ${cssVarV2('layer/insideBorder/border')}`,
  color: cssVarV2('text/primary'),
  background: 'transparent',
  textAlign: 'left',
  selectors: {
    '&:last-child': { borderBottom: 0 },
    '&:disabled': { opacity: 0.5 },
  },
});

export const rowLabel = style([
  bodyRegular,
  { display: 'flex', alignItems: 'baseline', gap: 6 },
]);

export const optional = style([
  footnoteRegular,
  { color: cssVarV2('text/tertiary') },
]);

export const rowValue = style([
  bodyRegular,
  {
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    overflow: 'hidden',
    color: cssVarV2('text/secondary'),
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
]);

export const rowArrow = style({
  fontSize: 24,
  lineHeight: 1,
  color: cssVarV2('icon/secondary'),
});

export const status = style([
  footnoteRegular,
  { color: cssVarV2('text/secondary') },
]);

export const warning = style([
  footnoteRegular,
  {
    padding: 12,
    border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
    borderRadius: 8,
    color: cssVarV2('text/primary'),
    background: cssVarV2('layer/background/primary'),
  },
]);

export const error = style([
  footnoteRegular,
  { color: cssVarV2('status/error') },
]);

export const footer = style({
  width: '100%',
  padding: '8px 16px',
  borderTop: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  background: cssVarV2('layer/background/primary'),
});

export const action = style({
  width: '100%',
  height: 44,
  borderRadius: 8,
  fontSize: 17,
  fontWeight: 400,
});

export const selectionList = style({
  margin: 0,
  padding: '8px 16px',
  listStyle: 'none',
});

export const selectionRow = style({
  width: '100%',
  minHeight: 52,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '6px 8px',
  border: 0,
  borderBottom: `0.5px solid ${cssVarV2('layer/insideBorder/border')}`,
  color: cssVarV2('text/primary'),
  background: 'transparent',
  textAlign: 'left',
});

export const selectionLabel = style([
  bodyRegular,
  {
    minWidth: 0,
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
]);

export const selectionDetail = style([
  footnoteRegular,
  { color: cssVarV2('text/secondary') },
]);

export const colorDot = style({
  width: 12,
  height: 12,
  flex: '0 0 auto',
  borderRadius: '50%',
});

export const checkmark = style({
  width: 32,
  textAlign: 'center',
  fontSize: 18,
  color: cssVarV2('button/primary'),
});

export const checkmarkPlaceholder = style({
  width: 32,
});

export const confirmation = style({
  padding: '32px 20px',
});

export const confirmationTitle = style([
  subHeadlineRegular,
  {
    margin: 0,
    color: cssVarV2('text/primary'),
  },
]);

export const confirmationText = style([
  bodyRegular,
  {
    margin: '12px 0 0',
    color: cssVarV2('text/secondary'),
  },
]);
