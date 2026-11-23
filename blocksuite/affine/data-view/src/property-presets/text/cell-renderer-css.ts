import { css } from '@emotion/css';
import { baseTheme } from '@toeverything/theme';

export const textStyle = css({
  display: 'flex',
  alignItems: 'center',
  height: '100%',
  width: '100%',
  padding: '0',
  border: 'none',
  fontFamily: baseTheme.fontSansFamily,
  fontSize: 'var(--affine-font-base)',
  lineHeight: 'var(--affine-line-height)',
  color: 'var(--affine-text-primary-color)',
  fontWeight: '400',
  backgroundColor: 'transparent',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const textInputStyle = css({
  display: 'flex',
  alignItems: 'center',
  height: '100%',
  width: '100%',
  padding: '0',
  border: 'none',
  fontFamily: baseTheme.fontSansFamily,
  fontSize: 'var(--affine-font-base)',
  lineHeight: 'var(--affine-line-height)',
  color: 'var(--affine-text-primary-color)',
  fontWeight: '400',
  backgroundColor: 'transparent',
  cursor: 'text',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  ':focus': {
    outline: 'none',
  },
});
