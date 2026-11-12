import { cssVarV2 } from '@blocksuite/affine-shared/theme';
import { css } from '@emotion/css';
import { baseTheme } from '@toeverything/theme';

export const rollupCellStyle = css({
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  height: '100%',
  fontFamily: baseTheme.fontSansFamily,
  fontSize: 'var(--data-view-cell-text-size)',
  lineHeight: 'var(--data-view-cell-text-line-height)',
  color: cssVarV2('text/primary'),
});

export const rollupValueStyle = css({
  padding: '0 4px',
  fontVariantNumeric: 'tabular-nums',
});

export const rollupBarWrapStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  width: '100%',
  padding: '0 4px',
});

export const rollupBarTrackStyle = css({
  flex: 1,
  height: '4px',
  borderRadius: '2px',
  backgroundColor: cssVarV2('layer/background/hoverOverlay'),
  overflow: 'hidden',
});

export const rollupBarFillStyle = css({
  height: '100%',
  borderRadius: '2px',
  backgroundColor: cssVarV2('button/primary'),
  transition: 'width 120ms ease',
});

export const rollupBarLabelStyle = css({
  minWidth: '34px',
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  color: cssVarV2('text/secondary'),
});
