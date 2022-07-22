import type {
    Patch,
    TDShape,
    TldrawCommand,
    TDBinding,
} from '@toeverything/components/board-types';
import type { TldrawApp } from '@toeverything/components/board-state';

export function createShapes(
    app: TldrawApp,
    shapes: TDShape[],
    bindings: TDBinding[] = []
): TldrawCommand {
    const { currentPageId } = app;

    const beforeShapes: Record<string, Patch<TDShape> | undefined> = {};
    const afterShapes: Record<string, Patch<TDShape> | undefined> = {};

    shapes.forEach(shape => {
        beforeShapes[shape.id] = undefined;
        afterShapes[shape.id] = shape;
    });

    const beforeBindings: Record<string, Patch<TDBinding> | undefined> = {};
    const afterBindings: Record<string, Patch<TDBinding> | undefined> = {};

    bindings.forEach(binding => {
        beforeBindings[binding.id] = undefined;
        afterBindings[binding.id] = binding;
    });

    return {
        id: 'create',
        before: {
            document: {
                pages: {
                    [currentPageId]: {
                        shapes: beforeShapes,
                        bindings: beforeBindings,
                    },
                },
                pageStates: {
                    [currentPageId]: {
                        selectedIds: [...app.selectedIds],
                    },
                },
            },
        },
        after: {
            document: {
                pages: {
                    [currentPageId]: {
                        shapes: afterShapes,
                        bindings: afterBindings,
                    },
                },
                pageStates: {
                    [currentPageId]: {
                        selectedIds: shapes.map(shape => shape.id),
                    },
                },
            },
        },
    };
}
