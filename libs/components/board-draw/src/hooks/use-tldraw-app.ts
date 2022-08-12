import { createContext, useContext } from 'react';
import type { TldrawApp } from '@toeverything/components/board-state';

export const TldrawContext = createContext<TldrawApp>({} as TldrawApp);

export function useTldrawApp() {
    const context = useContext(TldrawContext);
    return context;
}
