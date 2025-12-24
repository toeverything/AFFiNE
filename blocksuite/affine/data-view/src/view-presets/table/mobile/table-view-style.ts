import { css } from '@emotion/css';
import { cssVarV2 } from '@toeverything/theme/v2';

export const mobileTableViewWrapper = css({
  position: 'relative',
  width: '100%',
  paddingBottom: '4px',
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
