import { useTldrawApp } from './use-tldraw-app';
import {
    type MouseEvent as ReactMouseEvent,
    type KeyboardEvent as ReactKeyboardEvent,
    useCallback,
} from 'react';

export function useFileSystemHandlers() {
    const app = useTldrawApp();

    const onNewProject = useCallback(
        async (e?: ReactMouseEvent | ReactKeyboardEvent | KeyboardEvent) => {
            if (e && app.callbacks.onOpenProject) e.preventDefault();
            app.callbacks.onNewProject?.(app);
        },
        [app]
    );

    const onSaveProject = useCallback(
        (e?: ReactMouseEvent | ReactKeyboardEvent | KeyboardEvent) => {
            if (e && app.callbacks.onOpenProject) e.preventDefault();
            app.callbacks.onSaveProject?.(app);
        },
        [app]
    );

    const onSaveProjectAs = useCallback(
        (e?: ReactMouseEvent | ReactKeyboardEvent | KeyboardEvent) => {
            if (e && app.callbacks.onOpenProject) e.preventDefault();
            app.callbacks.onSaveProjectAs?.(app);
        },
        [app]
    );

    const onOpenProject = useCallback(
        async (e?: ReactMouseEvent | ReactKeyboardEvent | KeyboardEvent) => {
            if (e && app.callbacks.onOpenProject) e.preventDefault();
            app.callbacks.onOpenProject?.(app);
        },
        [app]
    );

    const onOpenMedia = useCallback(
        async (e?: ReactMouseEvent | ReactKeyboardEvent | KeyboardEvent) => {
            if (e && app.callbacks.onOpenMedia) e.preventDefault();
            app.callbacks.onOpenMedia?.(app);
        },
        [app]
    );

    return {
        onNewProject,
        onSaveProject,
        onSaveProjectAs,
        onOpenProject,
        onOpenMedia,
    };
}
