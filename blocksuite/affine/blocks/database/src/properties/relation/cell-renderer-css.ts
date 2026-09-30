import { cssVarV2 } from '@blocksuite/affine-shared/theme';
import { css } from '@emotion/css';
import { baseTheme } from '@toeverything/theme';

export const relationCellStyle = css({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '4px',
  width: '100%',
  height: '100%',
  padding: '0',
  overflow: 'hidden',
  fontFamily: baseTheme.fontSansFamily,
  fontSize: 'var(--data-view-cell-text-size)',
  lineHeight: 'var(--data-view-cell-text-line-height)',
  color: cssVarV2('text/primary'),
});

/** The Notion-style chip: the target row's icon, then its title, underlined. */
export const relationChipStyle = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  maxWidth: '100%',
  padding: '0 4px',
  borderRadius: '4px',
  backgroundColor: cssVarV2('layer/background/hoverOverlay'),
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

export const relationChipTitleStyle = css({
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

export const relationChipIconStyle = css({
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
  fontSize: '16px',
  color: cssVarV2('icon/primary'),
});

export const relationEmptyStyle = css({
  color: cssVarV2('text/placeholder'),
});

export const relationPickerStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  width: '100%',
  maxHeight: '180px',
  overflowY: 'auto',
  padding: '4px',
  borderRadius: '4px',
  backgroundColor: cssVarV2('layer/background/primary'),
  boxShadow: 'var(--affine-shadow-2)',
});

export const relationPickerRowStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '2px 4px',
  borderRadius: '4px',
  cursor: 'pointer',
  ':hover': {
    backgroundColor: cssVarV2('layer/background/hoverOverlay'),
  },
});

export const relationPickerHeaderStyle = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  padding: '2px 4px 6px',
  borderBottom: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  color: cssVarV2('text/secondary'),
  fontSize: '12px',
});

export const relationSelectStyle = css({
  maxWidth: '60%',
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: '4px',
  backgroundColor: cssVarV2('layer/background/primary'),
  color: cssVarV2('text/primary'),
  fontSize: '12px',
});
