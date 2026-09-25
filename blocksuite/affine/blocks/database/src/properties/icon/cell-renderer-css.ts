import { cssVarV2 } from '@blocksuite/affine-shared/theme';
import { css } from '@emotion/css';

export const iconCellStyle = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
});

export const iconGlyphStyle = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '20px',
  fontSize: '16px',
  lineHeight: 1,
  cursor: 'pointer',
});

export const iconEmptyStyle = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '20px',
  color: cssVarV2('text/placeholder'),
  cursor: 'pointer',
});
