import { baseTheme } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const dateCellStyle = style({
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  padding: '0',
  border: 'none',
  fontFamily: baseTheme.fontSansFamily,
  color: 'var(--affine-text-primary-color)',
  fontWeight: '400',
  backgroundColor: 'transparent',
  fontSize: 'var(--data-view-cell-text-size)',
  lineHeight: 'var(--data-view-cell-text-line-height)',
  height: 'var(--data-view-cell-text-line-height)',
});

export const dateValueContainerStyle = style({
  padding: '12px',
  backgroundColor: 'var(--layer-background-primary)',
  borderRadius: '12px',
  color: 'var(--text-secondary)',
  fontSize: '17px',
  lineHeight: '22px',
  height: '46px',
});

export const datePickerContainerStyle = style({
  padding: '12px',
  backgroundColor: 'var(--layer-background-primary)',
  borderRadius: '12px',
});
