import { TLDR } from '@toeverything/components/board-state';
import type {
    Patch,
    GroupShape,
    TDBinding,
    TDShape,
    TldrawCommand,
} from '@toeverything/components/board-types';
import type { TldrawApp } from '@toeverything/components/board-state';

export function ungroupShapes(
    app: TldrawApp,
    selectedIds: string[],
    groupShapes: GroupShape[],
    pageId: string
): TldrawCommand | undefined {
    const { bindings } = app;

    const beforeShapes: Record<string, Patch<TDShape | undefined>> = {};
    const afterShapes: Record<string, Patch<TDShape | undefined>> = {};

    const beforeBindings: Record<string, Patch<TDBinding | undefined>> = {};
    const afterBindings: Record<string, Patch<TDBinding | undefined>> = {};

    const beforeSelectedIds = selectedIds;
    const afterSelectedIds = selectedIds.filter(
        id => !groupShapes.find(shape => shape.id === id)
    );

    // The group shape
    groupShapes
        .filter(shape => !shape.isLocked)
        .forEach(groupShape => {
            const shapesToReparent: TDShape[] = [];
            const deletedGroupIds: string[] = [];

            // Remove the group shape in the next state
            beforeShapes[groupShape.id] = groupShape;
            afterShapes[groupShape.id] = undefined;

            // Select its children in the next state
            groupShape.children.forEach(id => {
                afterSelectedIds.push(id);
                const shape = app.getShape(id, pageId);
                shapesToReparent.push(shape);
            });

            // We'll start placing the shapes at this childIndex
            const startingChildIndex = groupShape.childIndex;

            // And we'll need to fit them under this child index
            const endingChildIndex = TLDR.get_child_index_above(
                app.state,
                groupShape.id,
                pageId
            );

            const step =
                (endingChildIndex - startingChildIndex) /
                shapesToReparent.length;

            // An array of shapes in order by their child index
            const sortedShapes = shapesToReparent.sort(
                (a, b) => a.childIndex - b.childIndex
            );

            // Reparent shapes to the page
            sortedShapes.forEach((shape, index) => {
                beforeShapes[shape.id] = {
                    parentId: shape.parentId,
                    childIndex: shape.childIndex,
                };

                afterShapes[shape.id] = {
                    parentId: pageId,
                    childIndex: startingChildIndex + step * index,
                };
            });

            // We also need to delete bindings that reference the deleted shapes
            bindings
                .filter(
                    binding =>
                        binding.toId === groupShape.id ||
                        binding.fromId === groupShape.id
                )
                .forEach(binding => {
                    for (const id of [binding.toId, binding.fromId]) {
                        // If the binding references the deleted group...
                        if (afterShapes[id] === undefined) {
                            // Delete the binding
                            beforeBindings[binding.id] = binding;
                            afterBindings[binding.id] = undefined;

                            // Let's also look each the bound shape...
                            const shape = app.getShape(id, pageId);

                            // If the bound shape has a handle that references the deleted binding...
                            if (shape.handles) {
                                Object.values(shape.handles)
                                    .filter(
                                        handle =>
                                            handle.bindingId === binding.id
                                    )
                                    .forEach(handle => {
                                        // Save the binding reference in the before patch
                                        beforeShapes[id] = {
                                            ...beforeShapes[id],
                                            handles: {
                                                ...beforeShapes[id]?.handles,
                                                [handle.id]: {
                                                    bindingId: binding.id,
                                                },
                                            },
                                        };

                                        // Unless we're currently deleting the shape, remove the
                                        // binding reference from the after patch
                                        if (!deletedGroupIds.includes(id)) {
                                            afterShapes[id] = {
                                                ...afterShapes[id],
                                                handles: {
                                                    ...afterShapes[id]?.handles,
                                                    [handle.id]: {
                                                        bindingId: undefined,
                                                    },
                                                },
                                            };
                                        }
                                    });
                            }
                        }
                    }
                });
        });

    return {
        id: 'ungroup',
        before: {
            document: {
                pages: {
                    [pageId]: {
                        shapes: beforeShapes,
                        bindings: beforeBindings,
                    },
                },
                pageStates: {
                    [pageId]: {
                        selectedIds: beforeSelectedIds,
                    },
                },
            },
        },
        after: {
            document: {
                pages: {
                    [pageId]: {
                        shapes: afterShapes,
                        bindings: beforeBindings,
                    },
                },
                pageStates: {
                    [pageId]: {
                        selectedIds: afterSelectedIds,
                    },
                },
            },
        },
    };
}
