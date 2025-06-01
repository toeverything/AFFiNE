// AFFiNE/blocksuite/affine/data-view/src/view-presets/chart/renderer.ts

import { createIcon } from '../../core/utils/uni-icon.js';
import { chartViewModel } from './define.js';
import { ChartViewUILogic } from './pc/chart-view-ui-logic.js';

export const chartViewMeta = chartViewModel.createMeta({
    icon: createIcon('AccountIcon'),
    // On desktop, use ChartViewUILogic
    // @ts-expect-error: typesafe mismatch between view.manager signatures
    pcLogic: () => ChartViewUILogic,
    // On mobile, for now use the same logic (or you could implement a mobile‐specific UI)
    //mobileLogic: () => ChartViewUILogic,
});
