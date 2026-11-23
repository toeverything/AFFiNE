import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const migrationDataNotificationContainer = style({
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  padding: '12px 12px 12px 12px',
  borderRadius: '8px',
  margin: '0 24px',
  marginTop: '24px',
  '@container': {
    'docs-body (width <= 500px)': {
      margin: '0 20px',
    },
    'docs-body (width <= 393px)': {
      margin: '0 16px',
    },
  },
});

export const migrationDataNotificationTitle = style({
  fontSize: cssVar('fontBase'),
  fontWeight: '600',
  lineHeight: '24px',
  color: cssVarV2('text/primary'),
  paddingBottom: '8px',
});

export const migrationDataNotificationContent = style({
  fontSize: cssVar('fontSm'),
  color: cssVarV2('text/secondary'),
  lineHeight: '22px',
  paddingBottom: '16px',
});

export const migrationDataNotificationError = style({
  fontSize: cssVar('fontSm'),
  color: cssVarV2('status/error'),
  lineHeight: '22px',
  paddingBottom: '16px',
});

export const migrationBackgroundCover = style({
  width: '250px',
  height: '150px',
  padding: '16px',
  marginTop: '-48px',
  objectFit: 'cover',
  float: 'right',
  userSelect: 'none',
});
