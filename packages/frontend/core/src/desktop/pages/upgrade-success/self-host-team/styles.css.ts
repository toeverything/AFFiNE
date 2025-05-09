import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';
export const leftContentText = style({
  fontSize: cssVar('fontBase'),
  fontWeight: 400,
  lineHeight: '1.6',
  maxWidth: '548px',
});
export const mail = style({
  color: cssVar('linkColor'),
  textDecoration: 'none',
  ':visited': {
    color: cssVar('linkColor'),
  },
});
export const content = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '28px',
});

export const licenseKeyContainer = style({
  width: '100%',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  backgroundColor: cssVarV2('layer/background/secondary'),
  borderRadius: '4px',
  border: `1px solid ${cssVarV2('layer/insideBorder/blackBorder')}`,
  padding: '8px 10px',
  gap: '8px',
});

export const icon = style({
  color: cssVarV2('icon/primary'),
});
