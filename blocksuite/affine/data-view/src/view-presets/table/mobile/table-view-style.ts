import { css } from '@emotion/css';
import { cssVarV2 } from '@toeverything/theme/v2';

export const mobileTableViewWrapper = css({
  position: 'relative',
  width: '100%',
  paddingBottom: '4px',
  /**
   * Disable horizontal scrolling to prevent crashes on iOS Safari
   * See https://github.com/toeverything/AFFiNE/pull/12203
   * and https://github.com/toeverything/blocksuite/pull/8784
   */
  overflowX: 'hidden',
  overflowY: 'hidden',
});

export const mobileTableViewContainer = css({
  position: 'relative',
  width: 'fit-content',
  minWidth: '100%',
});

export const mobileCellDivider = css({
  width: '1px',
  height: '100%',
  backgroundColor: cssVarV2.layer.insideBorder.border,
});
