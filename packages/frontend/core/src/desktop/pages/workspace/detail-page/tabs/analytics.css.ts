import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100%',
  padding: '16px',
  gap: '20px',
});

export const section = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
});

export const sectionHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
});

export const sectionTitle = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: '8px',
  color: cssVar('textPrimaryColor'),
  fontSize: cssVar('fontBase'),
  fontWeight: 600,
});

export const sectionSubtitle = style({
  color: cssVar('textSecondaryColor'),
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
});

export const windowButton = style({
  minWidth: '124px',
  justifyContent: 'space-between',
});

export const lockButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: 'transparent',
  padding: 0,
  margin: 0,
  color: cssVar('textSecondaryColor'),
  cursor: 'pointer',
  selectors: {
    '&:hover': {
      color: cssVar('textPrimaryColor'),
    },
  },
});

export const metrics = style({
  display: 'flex',
  alignItems: 'stretch',
  gap: '8px',
});

export const metricCard = style({
  minWidth: '0',
  flex: 1,
  borderRadius: '10px',
  border: `1px solid ${cssVar('borderColor')}`,
  backgroundColor: cssVar('backgroundPrimaryColor'),
  padding: '8px 10px',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
});

export const metricLabel = style({
  color: cssVar('textSecondaryColor'),
  fontSize: cssVar('fontXs'),
  lineHeight: 1.2,
});

export const metricValue = style({
  color: cssVar('textPrimaryColor'),
  fontSize: cssVar('fontBase'),
  fontWeight: 600,
  lineHeight: 1.2,
  fontVariantNumeric: 'tabular-nums',
});

export const chartContainer = style({
  height: '228px',
  borderRadius: '12px',
  border: `1px solid ${cssVar('borderColor')}`,
  backgroundColor: cssVar('backgroundPrimaryColor'),
  padding: '10px 10px 8px 10px',
});

export const axisLabels = style({
  display: 'flex',
  justifyContent: 'space-between',
  color: cssVar('textSecondaryColor'),
  fontSize: cssVar('fontXs'),
  fontVariantNumeric: 'tabular-nums',
  marginTop: '4px',
});

export const chartLegend = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '12px',
  color: cssVar('textSecondaryColor'),
  fontSize: cssVar('fontXs'),
});

export const legendItem = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
});

export const legendDot = style({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
});

export const tooltip = style({
  minWidth: '160px',
  borderRadius: '8px',
  border: `1px solid ${cssVar('borderColor')}`,
  backgroundColor: cssVar('backgroundPrimaryColor'),
  boxShadow: cssVar('shadow2'),
  padding: '8px 10px',
});

export const tooltipTitle = style({
  color: cssVar('textPrimaryColor'),
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  marginBottom: '6px',
});

export const tooltipRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  color: cssVar('textSecondaryColor'),
  fontSize: cssVar('fontXs'),
  lineHeight: 1.4,
});

export const tooltipValue = style({
  marginLeft: 'auto',
  color: cssVar('textPrimaryColor'),
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
});

export const emptyState = style({
  borderRadius: '10px',
  border: `1px dashed ${cssVar('borderColor')}`,
  color: cssVar('textSecondaryColor'),
  fontSize: cssVar('fontSm'),
  minHeight: '96px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: '0 16px',
});

export const viewersList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
});

export const viewerRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  borderRadius: '8px',
  padding: '6px 8px',
  selectors: {
    '&:hover': {
      backgroundColor: cssVar('hoverColor'),
    },
  },
});

export const viewerUser = style({
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

export const viewerName = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: cssVar('textPrimaryColor'),
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
});

export const viewerTime = style({
  color: cssVar('textSecondaryColor'),
  fontSize: cssVar('fontSm'),
  fontVariantNumeric: 'tabular-nums',
  flexShrink: 0,
});

export const loadMoreButton = style({
  alignSelf: 'flex-start',
});

export const loading = style({
  minHeight: '120px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});
