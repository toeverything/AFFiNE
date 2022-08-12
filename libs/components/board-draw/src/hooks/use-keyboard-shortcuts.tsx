import { AlignStyle, TDShapeType } from '@toeverything/components/board-types';
import * as React from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useFileSystemHandlers } from './use-file-system-handlers';
import { useTldrawApp } from './use-tldraw-app';

export function useKeyboardShortcuts(ref: React.RefObject<HTMLDivElement>) {
    const app = useTldrawApp();

    const canHandleEvent = React.useCallback(
        (ignoreMenus = false) => {
            const elm = ref.current;
            if (
                ignoreMenus &&
                (app.isMenuOpen || app.settings.keepStyleMenuOpen)
            )
                return true;
            return (
                elm &&
                (document.activeElement === elm ||
                    elm.contains(document.activeElement))
            );
        },
        [ref]
    );

    React.useEffect(() => {
        if (!app) return;

        const handleCut = (e: ClipboardEvent) => {
            if (!canHandleEvent(true)) return;

            if (app.readOnly) {
                app.copy(undefined, undefined, e);
                return;
            }

            app.cut(undefined, undefined, e);
        };

        const handleCopy = (e: ClipboardEvent) => {
            if (!canHandleEvent(true)) return;

            app.copy(undefined, undefined, e);
        };

        const handlePaste = (e: ClipboardEvent) => {
            if (!canHandleEvent(true)) return;
            if (app.readOnly) return;

            app.paste(undefined, e);
        };

        document.addEventListener('cut', handleCut);
        document.addEventListener('copy', handleCopy);
        document.addEventListener('paste', handlePaste);
        return () => {
            document.removeEventListener('cut', handleCut);
            document.removeEventListener('copy', handleCopy);
            document.removeEventListener('paste', handlePaste);
        };
    }, [app]);

    /* ---------------------- Tools --------------------- */

    useHotkeys(
        'v,1',
        () => {
            if (!canHandleEvent(true)) return;
            app.selectTool('select');
        },
        [app, ref.current]
    );

    useHotkeys(
        'd,p,2',
        () => {
            if (!canHandleEvent(true)) return;
            app.selectTool(TDShapeType.Draw);
        },
        undefined,
        [app]
    );

    useHotkeys(
        'e,3',
        () => {
            if (!canHandleEvent(true)) return;
            app.selectTool('erase');
        },
        undefined,
        [app]
    );

    useHotkeys(
        'r,4',
        () => {
            if (!canHandleEvent(true)) return;
            app.selectTool(TDShapeType.Rectangle);
        },
        undefined,
        [app]
    );

    useHotkeys(
        'o,5',
        () => {
            if (!canHandleEvent(true)) return;
            app.selectTool(TDShapeType.Ellipse);
        },
        undefined,
        [app]
    );

    useHotkeys(
        'g,6',
        () => {
            if (!canHandleEvent()) return;
            app.selectTool(TDShapeType.Triangle);
        },
        undefined,
        [app]
    );

    useHotkeys(
        'l,7',
        () => {
            if (!canHandleEvent(true)) return;
            app.selectTool(TDShapeType.Line);
        },
        undefined,
        [app]
    );

    useHotkeys(
        'a,8',
        () => {
            if (!canHandleEvent(true)) return;
            app.selectTool(TDShapeType.Arrow);
        },
        undefined,
        [app]
    );

    /* ---------------------- Misc ---------------------- */

    // Dark Mode

    useHotkeys(
        'ctrl+shift+d,⌘+shift+d',
        e => {
            if (!canHandleEvent(true)) return;
            app.toggleDarkMode();
            e.preventDefault();
        },
        undefined,
        [app]
    );

    // Focus Mode

    useHotkeys(
        'ctrl+.,⌘+.',
        () => {
            if (!canHandleEvent(true)) return;
            app.toggleFocusMode();
        },
        undefined,
        [app]
    );

    useHotkeys(
        'ctrl+shift+g,⌘+shift+g',
        () => {
            if (!canHandleEvent(true)) return;
            app.toggleGrid();
        },
        undefined,
        [app]
    );

    // File System

    const {
        onNewProject,
        onOpenProject,
        onSaveProject,
        onSaveProjectAs,
        onOpenMedia,
    } = useFileSystemHandlers();

    useHotkeys(
        'ctrl+n,⌘+n',
        e => {
            if (!canHandleEvent()) return;

            onNewProject(e);
        },
        undefined,
        [app]
    );
    useHotkeys(
        'ctrl+s,⌘+s',
        e => {
            if (!canHandleEvent()) return;

            onSaveProject(e);
        },
        undefined,
        [app]
    );

    useHotkeys(
        'ctrl+shift+s,⌘+shift+s',
        e => {
            if (!canHandleEvent()) return;

            onSaveProjectAs(e);
        },
        undefined,
        [app]
    );
    useHotkeys(
        'ctrl+o,⌘+o',
        e => {
            if (!canHandleEvent()) return;

            onOpenProject(e);
        },
        undefined,
        [app]
    );
    useHotkeys(
        'ctrl+u,⌘+u',
        e => {
            if (!canHandleEvent()) return;
            onOpenMedia(e);
        },
        undefined,
        [app]
    );

    // Undo Redo

    useHotkeys(
        '⌘+z,ctrl+z',
        () => {
            if (!canHandleEvent(true)) return;

            if (app.session) {
                app.cancelSession();
            } else {
                app.undo();
            }
        },
        undefined,
        [app]
    );

    useHotkeys(
        'ctrl+shift+z,⌘+shift+z',
        () => {
            if (!canHandleEvent(true)) return;

            if (app.session) {
                app.cancelSession();
            } else {
                app.redo();
            }
        },
        undefined,
        [app]
    );

    // Undo Redo

    useHotkeys(
        '⌘+u,ctrl+u',
        () => {
            if (!canHandleEvent()) return;
            app.undoSelect();
        },
        undefined,
        [app]
    );

    useHotkeys(
        'ctrl+shift-u,⌘+shift+u',
        () => {
            if (!canHandleEvent()) return;
            app.redoSelect();
        },
        undefined,
        [app]
    );

    /* -------------------- Commands -------------------- */

    // Camera

    useHotkeys(
        'ctrl+=,⌘+=,ctrl+num_subtract,⌘+num_subtract',
        e => {
            if (!canHandleEvent(true)) return;
            app.zoomIn();
            e.preventDefault();
        },
        undefined,
        [app]
    );

    useHotkeys(
        'ctrl+-,⌘+-,ctrl+num_add,⌘+num_add',
        e => {
            if (!canHandleEvent(true)) return;

            app.zoomOut();
            e.preventDefault();
        },
        undefined,
        [app]
    );

    useHotkeys(
        'shift+0,ctrl+numpad_0,⌘+numpad_0',
        () => {
            if (!canHandleEvent(true)) return;
            app.resetZoom();
        },
        undefined,
        [app]
    );

    useHotkeys(
        'shift+1',
        () => {
            if (!canHandleEvent(true)) return;
            app.zoomToFit();
        },
        undefined,
        [app]
    );

    useHotkeys(
        'shift+2',
        () => {
            if (!canHandleEvent(true)) return;
            app.zoomToSelection();
        },
        undefined,
        [app]
    );

    // Duplicate

    useHotkeys(
        'ctrl+d,⌘+d',
        e => {
            if (!canHandleEvent()) return;

            app.duplicate();
            e.preventDefault();
        },
        undefined,
        [app]
    );

    // Flip

    useHotkeys(
        'shift+h',
        () => {
            if (!canHandleEvent(true)) return;
            app.flipHorizontal();
        },
        undefined,
        [app]
    );

    useHotkeys(
        'shift+v',
        () => {
            if (!canHandleEvent(true)) return;
            app.flipVertical();
        },
        undefined,
        [app]
    );

    // Cancel

    useHotkeys(
        'escape',
        () => {
            if (!canHandleEvent(true)) return;

            app.cancel();
        },
        undefined,
        [app]
    );

    // Delete

    useHotkeys(
        'backspace,del',
        () => {
            if (!canHandleEvent()) return;
            app.delete();
        },
        undefined,
        [app]
    );

    // Select All

    useHotkeys(
        '⌘+a,ctrl+a',
        () => {
            if (!canHandleEvent(true)) return;
            app.selectAll();
        },
        undefined,
        [app]
    );

    // Nudge

    useHotkeys(
        'up',
        () => {
            if (!canHandleEvent()) return;
            app.nudge([0, -1], false);
        },
        undefined,
        [app]
    );

    useHotkeys(
        'right',
        () => {
            if (!canHandleEvent()) return;
            app.nudge([1, 0], false);
        },
        undefined,
        [app]
    );

    useHotkeys(
        'down',
        () => {
            if (!canHandleEvent()) return;
            app.nudge([0, 1], false);
        },
        undefined,
        [app]
    );

    useHotkeys(
        'left',
        () => {
            if (!canHandleEvent()) return;
            app.nudge([-1, 0], false);
        },
        undefined,
        [app]
    );

    useHotkeys(
        'shift+up',
        () => {
            if (!canHandleEvent()) return;
            app.nudge([0, -1], true);
        },
        undefined,
        [app]
    );

    useHotkeys(
        'shift+right',
        () => {
            if (!canHandleEvent()) return;
            app.nudge([1, 0], true);
        },
        undefined,
        [app]
    );

    useHotkeys(
        'shift+down',
        () => {
            if (!canHandleEvent()) return;
            app.nudge([0, 1], true);
        },
        undefined,
        [app]
    );

    useHotkeys(
        'shift+left',
        () => {
            if (!canHandleEvent()) return;
            app.nudge([-1, 0], true);
        },
        undefined,
        [app]
    );

    useHotkeys(
        '⌘+shift+l,ctrl+shift+l',
        () => {
            if (!canHandleEvent()) return;
            app.toggleLocked();
        },
        undefined,
        [app]
    );

    // Copy, Cut & Paste

    // useHotkeys(
    //   '⌘+c,ctrl+c',
    //   () => {
    //     if (!canHandleEvent()) return
    //     app.copy()
    //   },
    //   undefined,
    //   [app]
    // )

    useHotkeys(
        '⌘+shift+c,ctrl+shift+c',
        e => {
            if (!canHandleEvent()) return;

            app.copySvg();
            e.preventDefault();
        },
        undefined,
        [app]
    );

    // useHotkeys(
    //   '⌘+x,ctrl+x',
    //   () => {
    //     if (!canHandleEvent()) return
    //     app.cut()
    //   },
    //   undefined,
    //   [app]
    // )

    // useHotkeys(
    //   '⌘+v,ctrl+v',
    //   () => {
    //     if (!canHandleEvent()) return

    //     app.paste()
    //   },
    //   undefined,
    //   [app]
    // )

    // Group & Ungroup

    useHotkeys(
        '⌘+g,ctrl+g',
        e => {
            if (!canHandleEvent()) return;

            app.group();
            e.preventDefault();
        },
        undefined,
        [app]
    );

    useHotkeys(
        '⌘+shift+g,ctrl+shift+g',
        e => {
            if (!canHandleEvent()) return;

            app.ungroup();
            e.preventDefault();
        },
        undefined,
        [app]
    );

    // Move

    useHotkeys(
        '[',
        () => {
            if (!canHandleEvent(true)) return;
            app.moveBackward();
        },
        undefined,
        [app]
    );

    useHotkeys(
        ']',
        () => {
            if (!canHandleEvent(true)) return;
            app.moveForward();
        },
        undefined,
        [app]
    );

    useHotkeys(
        'shift+[',
        () => {
            if (!canHandleEvent(true)) return;
            app.moveToBack();
        },
        undefined,
        [app]
    );

    useHotkeys(
        'shift+]',
        () => {
            if (!canHandleEvent(true)) return;
            app.moveToFront();
        },
        undefined,
        [app]
    );

    useHotkeys(
        'ctrl+shift+backspace,⌘+shift+backspace',
        e => {
            if (!canHandleEvent()) return;
            if (app.settings.isDebugMode) {
                app.resetDocument();
            }
            e.preventDefault();
        },
        undefined,
        [app]
    );

    // Text Align

    useHotkeys(
        'alt+command+l,alt+ctrl+l',
        e => {
            if (!canHandleEvent(true)) return;
            app.style({ textAlign: AlignStyle.Start });
            e.preventDefault();
        },
        undefined,
        [app]
    );

    useHotkeys(
        'alt+command+t,alt+ctrl+t',
        e => {
            if (!canHandleEvent(true)) return;
            app.style({ textAlign: AlignStyle.Middle });
            e.preventDefault();
        },
        undefined,
        [app]
    );

    useHotkeys(
        'alt+command+r,alt+ctrl+r',
        e => {
            if (!canHandleEvent(true)) return;
            app.style({ textAlign: AlignStyle.End });
            e.preventDefault();
        },
        undefined,
        [app]
    );
}
