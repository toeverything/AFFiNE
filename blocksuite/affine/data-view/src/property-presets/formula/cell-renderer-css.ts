import { css } from '@emotion/css';
import { baseTheme } from '@toeverything/theme';

export const formulaCellStyle = css({
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  fontFamily: baseTheme.fontSansFamily,
  fontSize: 'var(--data-view-cell-text-size)',
  lineHeight: 'var(--data-view-cell-text-line-height)',
  color: 'var(--affine-text-primary-color)',
  wordBreak: 'break-all',
});

export const formulaNumberStyle = css({
  justifyContent: 'flex-end',
});

export const formulaCheckboxStyle = css({
  display: 'flex',
  alignItems: 'center',
  fontSize: '20px',
  color: 'var(--affine-icon-color)',
});

export const formulaErrorStyle = css({
  color: 'var(--affine-error-color)',
  cursor: 'help',
});
