import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const group = style({
  display: 'flex',
  gap: '16px',
  justifyContent: 'center',
});
export const deleteHintContainer = style({
  position: 'relative',
  zIndex: 2,
  padding: '14px 20px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexShrink: 0,
  bottom: '0',
  gap: '16px',
  backgroundColor: cssVar('backgroundPrimaryColor'),
  borderTop: `1px solid ${cssVar('borderColor')}`,
});
export const deleteHintText = style({
  fontSize: '15px',
  fontWeight: '500',
  lineHeight: '24px',
  color: cssVar('textSecondaryColor'),
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  overflow: 'hidden',
});
export const buttonContainer = style({
  padding: '8px 18px',
  height: '36px',
});
export const icon = style({
  width: 20,
  height: 20,
});
