import {
  formatEdgelessToolShortcut,
  getEdgelessToolShortcut,
} from '@blocksuite/affine-shared/utils';

import {
  EdgelessBrushDarkIcon,
  EdgelessBrushLightIcon,
  EdgelessHighlighterDarkIcon,
  EdgelessHighlighterLightIcon,
} from './icons';
import type { Pen } from './types';

export const penIconMap = {
  dark: {
    brush: EdgelessBrushDarkIcon,
    highlighter: EdgelessHighlighterDarkIcon,
  },
  light: {
    brush: EdgelessBrushLightIcon,
    highlighter: EdgelessHighlighterLightIcon,
  },
};

export const penInfoMap: { [k in Pen]: { tip: string; shortcut: string } } = {
  brush: {
    tip: 'Pen',
    get shortcut() {
      return formatEdgelessToolShortcut(getEdgelessToolShortcut('pen'));
    },
  },
  highlighter: {
    tip: 'Highlighter',
    get shortcut() {
      return `⇧ ${formatEdgelessToolShortcut(getEdgelessToolShortcut('pen'))}`;
    },
  },
};
