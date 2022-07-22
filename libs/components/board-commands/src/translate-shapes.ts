import { Vec } from '@tldraw/vec';
import { TLDR } from '@toeverything/components/board-state';
import type {
    TldrawCommand,
    PagePartial,
} from '@toeverything/components/board-types';
import type { TldrawApp } from '@toeverything/components/board-state';

export function translateShapes(
    app: TldrawApp,
    ids: string[],
    delta: number[]
): TldrawCommand {
    const { currentPageId, selectedIds } = app;

    // Clear session cache
    app.rotationInfo.selectedIds = [...selectedIds];

    const before: PagePartial = {
        shapes: {},
        bindings: {},
    };

    const after: PagePartial = {
        shapes: {},
        bindings: {},
    };

    const idsToMutate = ids
        .flatMap(id => {
            const shape = app.getShape(id);
            return shape.children ? shape.children : shape.id;
        })
        .filter(id => !app.getShape(id).isLocked);

    const change = TLDR.mutate_shapes(
        app.state,
        idsToMutate,
        shape => ({
            point: Vec.toFixed(Vec.add(shape.point, delta)),
        }),
        currentPageId
    );

    before.shapes = change.before;
    after.shapes = change.after;

    // Delete bindings from nudged shapes, unless both bound and bound-to shapes are selected
    const bindingsToDelete = TLDR.get_bindings(app.state, currentPageId).filter(
        binding => ids.includes(binding.fromId) && !ids.includes(binding.toId)
    );

    bindingsToDelete.forEach(binding => {
        before.bindings[binding.id] = binding;
        after.bindings[binding.id] = undefined;

        for (const id of [binding.toId, binding.fromId]) {
            // Let's also look at the bound shape...
            const shape = app.getShape(id);

            if (!shape.handles) continue;

            // If the bound shape has a handle that references the deleted binding, delete that reference

            Object.values(shape.handles)
                .filter(handle => handle.bindingId === binding.id)
                .forEach(handle => {
                    before.shapes[id] = {
                        ...before.shapes[id],
                        handles: {
                            ...before.shapes[id]?.handles,
                            [handle.id]: { bindingId: binding.id },
                        },
                    };
                    after.shapes[id] = {
                        ...after.shapes[id],
                        handles: {
                            ...after.shapes[id]?.handles,
                            [handle.id]: { bindingId: undefined },
                        },
                    };
                });
        }
    });

    return {
        id: 'translate',
        before: {
            document: {
                pages: {
                    [currentPageId]: before,
                },
                pageStates: {
                    [currentPageId]: {
                        selectedIds: ids,
                    },
                },
            },
        },
        after: {
            document: {
                pages: {
                    [currentPageId]: after,
                },
                pageStates: {
                    [currentPageId]: {
                        selectedIds: ids,
                    },
                },
            },
        },
    };
}
