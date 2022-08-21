import type { TldrawApp } from '@toeverything/components/board-state';
import * as React from 'react';

export const TldrawContext = React.createContext<TldrawApp>({} as TldrawApp);

export function useTldrawApp() {
    const context = React.useContext(TldrawContext);
    return context;
}
