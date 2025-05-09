import type { ColorScheme } from '@blocksuite/affine-model';
import { createContext } from '@lit/context';
import type { Subject } from 'rxjs';

import type { EdgelessToolbarWidget } from './edgeless-toolbar.js';

export interface EdgelessToolbarSlots {
  resize: Subject<{ w: number; h: number }>;
}

export const edgelessToolbarSlotsContext = createContext<EdgelessToolbarSlots>(
  Symbol('edgelessToolbarSlotsContext')
);

export const edgelessToolbarThemeContext = createContext<ColorScheme>(
  Symbol('edgelessToolbarThemeContext')
);

export const edgelessToolbarContext = createContext<EdgelessToolbarWidget>(
  Symbol('edgelessToolbarContext')
);
