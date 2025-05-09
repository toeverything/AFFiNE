import type { SlashMenuTooltip } from '../types';
import { CopyTooltip } from './copy';
import { DeleteTooltip } from './delete';
import { MoveDownTooltip } from './move-down';
import { MoveUpTooltip } from './move-up';
import { NowTooltip } from './now';
import { TodayTooltip } from './today';
import { TomorrowTooltip } from './tomorrow';
import { YesterdayTooltip } from './yesterday';

export const slashMenuToolTips: Record<string, SlashMenuTooltip> = {
  Today: {
    figure: TodayTooltip,
    caption: 'Today',
  },

  Tomorrow: {
    figure: TomorrowTooltip,
    caption: 'Tomorrow',
  },

  Yesterday: {
    figure: YesterdayTooltip,
    caption: 'Yesterday',
  },

  Now: {
    figure: NowTooltip,
    caption: 'Now',
  },

  'Move Up': {
    figure: MoveUpTooltip,
    caption: 'Move Up',
  },

  'Move Down': {
    figure: MoveDownTooltip,
    caption: 'Move Down',
  },

  Copy: {
    figure: CopyTooltip,
    caption: 'Copy / Duplicate',
  },

  Delete: {
    figure: DeleteTooltip,
    caption: 'Delete',
  },
};
