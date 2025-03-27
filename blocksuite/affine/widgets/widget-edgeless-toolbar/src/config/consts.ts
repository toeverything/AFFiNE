import { StyleGeneralIcon, StyleScribbleIcon } from '@blocksuite/icons/lit';

import type { MenuItem } from './types';

export const LINE_STYLE_LIST = [
  {
    key: 'General',
    value: false,
    icon: StyleGeneralIcon(),
  },
  {
    key: 'Scribbled',
    value: true,
    icon: StyleScribbleIcon(),
  },
] as const satisfies MenuItem<boolean>[];
