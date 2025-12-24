import { css } from '@emotion/css';
import { baseTheme } from '@toeverything/theme';

export const multiSelectStyle = css({
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  height: '100%',
  padding: '0',
  border: 'none',
  fontFamily: baseTheme.fontSansFamily,
  fontSize: 'var(--data-view-cell-text-size)',
  lineHeight: 'var(--data-view-cell-text-line-height)',
  color: 'var(--affine-text-primary-color)',
  fontWeight: '400',
  backgroundColor: 'transparent',
});
