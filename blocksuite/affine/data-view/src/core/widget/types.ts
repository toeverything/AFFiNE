import type { UniComponent } from '@blocksuite/affine-shared/types';

import type { DataViewInstance } from '../view/types.js';

export type DataViewWidgetProps = {
  dataViewInstance: DataViewInstance;
};
export type DataViewWidget = UniComponent<DataViewWidgetProps>;
