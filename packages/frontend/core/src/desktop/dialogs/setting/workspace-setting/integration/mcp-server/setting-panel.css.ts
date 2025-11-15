import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const connectButton = style({
  width: '100%',
  marginTop: '24px',
});

export const section = style({
  display: 'flex',
  flexDirection: 'column',
  border: `1px solid ${cssVar('borderColor')}`,
  borderRadius: '8px',
  padding: '8px 16px',
  gap: '0px',
  marginBottom: '16px',
});

export const sectionHeader = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
});

export const preArea = style({
  backgroundColor: cssVarV2('layer/background/secondary'),
  padding: '16px 16px',
  borderRadius: '8px',
  margin: '8px 0',
  fontFamily: cssVar('fontMonoFamily'),
  overflowX: 'auto',
});

export const sectionDescription = style({
  fontSize: 13,
  lineHeight: '22px',
  color: cssVarV2('text/secondary'),
});

export const sectionTitle = style({
  fontSize: 14,
  fontWeight: 500,
  lineHeight: 1.25,
  color: cssVarV2('text/primary'),
});
