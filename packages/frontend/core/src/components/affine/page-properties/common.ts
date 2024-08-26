import { createContext } from 'react';

import type { PagePropertiesManager } from './page-properties-manager';

// @ts-expect-error this should always be set
export const managerContext = createContext<PagePropertiesManager>();
