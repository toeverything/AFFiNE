import { createContext } from 'react';

import type { SplitViewContextValue } from './types';

export const SplitViewContext = createContext<SplitViewContextValue>({});
