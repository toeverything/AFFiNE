import { Utils } from '@tldraw/core';
import type { TldrawApp } from '@toeverything/components/board-state';
import { TLDR } from '@toeverything/components/board-state';
import type {
    Patch,
    TDBinding,
    TldrawCommand,
} from '@toeverything/components/board-types';
import { TDShape, TDShapeType } from '@toeverything/components/board-types';

export function groupShapes(
    app: TldrawApp,
    ids: string[],
    groupId: string,
    pageId: string
): TldrawCommand | undefined {
    if (ids.length < 2) return;

    const beforeShapes: Record<string, Patch<TDShape | undefined>> = {};
    const afterShapes: Record<string, Patch<TDShape | undefined>> = {};

    const beforeBindings: Record<string, Patch<TDBinding | undefined>> = {};
    const afterBindings: Record<string, Patch<TDBinding | undefined>> = {};

    const idsToGroup = [...ids];
    const shapesToGroup: TDShape[] = [];
    const deletedGroupIds: string[] = [];
    const otherEffectedGroups: TDShape[] = [];

    // Collect all of the shapes to group (and their ids)
    for (const id of ids) {
        const shape = app.getShape(id);
        if (shape.isLocked) continue;

        if (shape.children === undefined) {
            shapesToGroup.push(shape);
        } else {
            const childIds = shape.children.filter(
                id => !app.getShape(id).isLocked
            );
            otherEffectedGroups.push(shape);
            idsToGroup.push(...childIds);
            shapesToGroup.push(
                ...childIds.map(id => app.getShape(id)).filter(Boolean)
            );
        }
    }

    // 1. Can we create this group?

    // Do the shapes have the same parent?
    if (
        shapesToGroup.every(
            shape => shape.parentId === shapesToGroup[0].parentId
        )
    ) {
        // Is the common parent a shape (not the page)?
        if (shapesToGroup[0].parentId !== pageId) {
            const commonParent = app.getShape(shapesToGroup[0].parentId);
            // Are all of the common parent's shapes selected?
            if (commonParent.children?.length === idsToGroup.length) {
                // Don't create a group if that group would be the same as the
                // existing group.
                return;
            }
        }
    }

    // A flattened array of shapes from the page
    const flattenedShapes = TLDR.flatten_page(app.state, pageId);

    // A map of shapes to their index in flattendShapes
    const shapeIndexMap = Object.fromEntries(
        shapesToGroup.map(shape => [shape.id, flattenedShapes.indexOf(shape)])
    );

    // An array of shapes in order by their index in flattendShapes
    const sortedShapes = shapesToGroup.sort(
        (a, b) => shapeIndexMap[a.id] - shapeIndexMap[b.id]
    );

    // The parentId is always the current page
    const groupParentId = pageId; // sortedShapes[0].parentId

    // The childIndex should be the lowest index of the selected shapes
    // with a parent that is the current page; or else the child index
    // of the lowest selected shape.
    const groupChildIndex = (
        sortedShapes.filter(shape => shape.parentId === pageId)[0] ||
        sortedShapes[0]
    ).childIndex;

    // The shape's point is the min point of its childrens' common bounds
    const groupBounds = Utils.getCommonBounds(
        shapesToGroup.map(shape => TLDR.get_bounds(shape))
    );

    // Create the group
    beforeShapes[groupId] = undefined;

    afterShapes[groupId] = TLDR.get_shape_util(TDShapeType.Group).create({
        id: groupId,
        childIndex: groupChildIndex,
        parentId: groupParentId,
        point: [groupBounds.minX, groupBounds.minY],
        size: [groupBounds.width, groupBounds.height],
        children: sortedShapes.map(shape => shape.id),
        workspace: app.document.id,
    });

    // Reparent shapes to the new group
    sortedShapes.forEach((shape, index) => {
        // If the shape is part of a different group, mark the parent shape for cleanup
        if (shape.parentId !== pageId) {
            const parentShape = app.getShape(shape.parentId);
            otherEffectedGroups.push(parentShape);
        }

        beforeShapes[shape.id] = {
            ...beforeShapes[shape.id],
            parentId: shape.parentId,
            childIndex: shape.childIndex,
        };

        afterShapes[shape.id] = {
            ...afterShapes[shape.id],
            parentId: groupId,
            childIndex: index + 1,
        };
    });

    // Clean up effected parents
    while (otherEffectedGroups.length > 0) {
        const shape = otherEffectedGroups.pop();
        if (!shape) break;

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const nextChildren = (beforeShapes[shape.id]?.children ||
            shape.children)!.filter(
            childId =>
                childId &&
                !(
                    idsToGroup.includes(childId) ||
                    deletedGroupIds.includes(childId)
                )
        );

        // If the parent has no children, remove it
        if (nextChildren.length === 0) {
            beforeShapes[shape.id] = shape;
            afterShapes[shape.id] = undefined;

            // And if that parent is part of a different group, mark it for cleanup
            // (This is necessary only when we implement nested groups.)
            if (shape.parentId !== pageId) {
                deletedGroupIds.push(shape.id);
                otherEffectedGroups.push(app.getShape(shape.parentId));
            }
        } else {
            beforeShapes[shape.id] = {
                ...beforeShapes[shape.id],
                children: shape.children,
            };

            afterShapes[shape.id] = {
                ...afterShapes[shape.id],
                children: nextChildren,
            };
        }
    }

    // TODO: This code is copied from delete.command. Create a shared helper!

    const { bindings } = app;

    const deletedGroupIdsSet = new Set(deletedGroupIds);

    // We also need to delete bindings that reference the deleted shapes
    bindings.forEach(binding => {
        for (const id of [binding.toId, binding.fromId]) {
            // If the binding references a deleted shape...
            if (deletedGroupIdsSet.has(id)) {
                // Delete this binding
                beforeBindings[binding.id] = binding;
                afterBindings[binding.id] = undefined;

                // Let's also look each the bound shape...
                const shape = app.getShape(id);

                // If the bound shape has a handle that references the deleted binding...
                if (shape.handles) {
                    Object.values(shape.handles)
                        .filter(handle => handle.bindingId === binding.id)
                        .forEach(handle => {
                            // Save the binding reference in the before patch
                            beforeShapes[id] = {
                                ...beforeShapes[id],
                                handles: {
                                    ...beforeShapes[id]?.handles,
                                    [handle.id]: { bindingId: binding.id },
                                },
                            };

                            // Unless we're currently deleting the shape, remove the
                            // binding reference from the after patch
                            if (!deletedGroupIds.includes(id)) {
                                afterShapes[id] = {
                                    ...afterShapes[id],
                                    handles: {
                                        ...afterShapes[id]?.handles,
                                        [handle.id]: { bindingId: undefined },
                                    },
                                };
                            }
                        });
                }
            }
        }
    });

    return {
        id: 'group',
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
                        selectedIds: ids,
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
                        selectedIds: [groupId],
                    },
                },
            },
        },
    };
}
