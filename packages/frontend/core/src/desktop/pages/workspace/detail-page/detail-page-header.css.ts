import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const root = style({
  position: 'relative',
  height: '100%',
  width: '100%',
});

export const header = style({
  display: 'flex',
  height: '100%',
  width: '100%',
  alignItems: 'center',
  gap: 12,
  containerName: 'detail-page-header',
  containerType: 'inline-size',
});
export const spacer = style({
  flexGrow: 1,
  minWidth: 12,
});
export const journalWeekPicker = style({
  minWidth: 100,
  flexGrow: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const iconButtonContainer = style({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
});

export const dragHandle = style({
  cursor: 'grab',
  position: 'absolute',
  top: 0,
  bottom: 0,
  left: -16,
  width: 16,
  opacity: 0,
  selectors: {
    [`${root}:hover &, ${root}[data-dragging="true"] &`]: {
      opacity: 1,
    },
  },
});

export const dragPreview = style({
  // see https://atlassian.design/components/pragmatic-drag-and-drop/web-platform-design-constraints/#native-drag-previews
  maxWidth: '280px',
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  padding: '4px 16px',
  overflow: 'hidden',
  backgroundColor: cssVarV2('layer/background/primary'),
  borderRadius: '12px',
});

export const templateMark = style({
  backgroundColor: cssVarV2.button.templateLabelBackground,
  color: cssVarV2.button.primary,
  borderRadius: 4,
  padding: '2px 8px',
  fontSize: 12,
  fontWeight: 500,
  lineHeight: '20px',
});

export const journalTemplateMark = style({
  '@container': {
    '(width <= 400px)': {
      display: 'none',
    },
  },
});
