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
    shortcut: 'P',
  },
  highlighter: {
    tip: 'Highlighter',
    shortcut: '⇧ P',
  },
};
