/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Utils } from '@tldraw/core';
import { Vec } from '@tldraw/vec';
import { TLDR } from '@toeverything/components/board-state';
import type {
    PagePartial,
    TldrawCommand,
    TDShape,
} from '@toeverything/components/board-types';
import type { TldrawApp } from '@toeverything/components/board-state';

export function duplicateShapes(
    app: TldrawApp,
    ids: string[],
    point?: number[]
): TldrawCommand {
    const { selectedIds, currentPageId, page, shapes } = app;

    const before: PagePartial = {
        shapes: {},
        bindings: {},
    };

    const after: PagePartial = {
        shapes: {},
        bindings: {},
    };

    const duplicateMap: Record<string, string> = {};

    const shapesToDuplicate = ids
        .map(id => app.getShape(id))
        .filter(shape => !ids.includes(shape.parentId));

    // Create duplicates
    shapesToDuplicate.forEach(shape => {
        const duplicatedId = Utils.uniqueId();
        before.shapes[duplicatedId] = undefined;

        after.shapes[duplicatedId] = {
            ...Utils.deepClone(shape),
            id: duplicatedId,
            childIndex: TLDR.get_child_index_above(
                app.state,
                shape.id,
                currentPageId
            ),
        };

        if (shape.children) {
            after.shapes[duplicatedId]!.children = [];
        }

        if (shape.parentId !== currentPageId) {
            const parent = app.getShape(shape.parentId);

            before.shapes[parent.id] = {
                ...before.shapes[parent.id],
                children: parent.children,
            };

            after.shapes[parent.id] = {
                ...after.shapes[parent.id],
                children: [
                    ...(after.shapes[parent.id] || parent).children!,
                    duplicatedId,
                ],
            };
        }

        duplicateMap[shape.id] = duplicatedId;
    });

    // If the shapes have children, then duplicate those too
    shapesToDuplicate.forEach(shape => {
        if (shape.children) {
            shape.children.forEach(childId => {
                const child = app.getShape(childId);
                const duplicatedId = Utils.uniqueId();
                const duplicatedParentId = duplicateMap[shape.id];
                before.shapes[duplicatedId] = undefined;
                after.shapes[duplicatedId] = {
                    ...Utils.deepClone(child),
                    id: duplicatedId,
                    parentId: duplicatedParentId,
                    childIndex: TLDR.get_child_index_above(
                        app.state,
                        child.id,
                        currentPageId
                    ),
                };
                duplicateMap[childId] = duplicatedId;
                after.shapes[duplicateMap[shape.id]]?.children?.push(
                    duplicatedId
                );
            });
        }
    });

    // Which ids did we end up duplicating?
    const dupedShapeIds = new Set(Object.keys(duplicateMap));

    // Handle bindings that effect duplicated shapes
    Object.values(page.bindings)
        .filter(
            binding =>
                dupedShapeIds.has(binding.fromId) ||
                dupedShapeIds.has(binding.toId)
        )
        .forEach(binding => {
            if (dupedShapeIds.has(binding.fromId)) {
                if (dupedShapeIds.has(binding.toId)) {
                    // If the binding is between two duplicating shapes then
                    // duplicate the binding, too
                    const duplicatedBindingId = Utils.uniqueId();

                    const duplicatedBinding = {
                        ...Utils.deepClone(binding),
                        id: duplicatedBindingId,
                        fromId: duplicateMap[binding.fromId],
                        toId: duplicateMap[binding.toId],
                    };

                    before.bindings[duplicatedBindingId] = undefined;
                    after.bindings[duplicatedBindingId] = duplicatedBinding;

                    // Change the duplicated shape's handle so that it reference
                    // the duplicated binding
                    const boundShape = after.shapes[duplicatedBinding.fromId];
                    Object.values(boundShape!.handles!).forEach(handle => {
                        if (handle!.bindingId === binding.id) {
                            handle!.bindingId = duplicatedBindingId;
                        }
                    });
                } else {
                    // If only the fromId is selected, delete the binding on
                    // the duplicated shape's handles
                    const boundShape =
                        after.shapes[duplicateMap[binding.fromId]];
                    Object.values(boundShape!.handles!).forEach(handle => {
                        if (handle!.bindingId === binding.id) {
                            handle!.bindingId = undefined;
                        }
                    });
                }
            }
        });

    // Now move the shapes

    const shapesToMove = Object.values(after.shapes) as TDShape[];

    if (point) {
        const commonBounds = Utils.getCommonBounds(
            shapesToMove.map(shape => TLDR.get_bounds(shape))
        );
        const center = Utils.getBoundsCenter(commonBounds);
        shapesToMove.forEach(shape => {
            // Could be a group
            if (!shape.point) return;
            shape.point = Vec.sub(point, Vec.sub(center, shape.point));
        });
    } else {
        const offset = [16, 16];
        shapesToMove.forEach(shape => {
            // Could be a group
            if (!shape.point) return;
            shape.point = Vec.add(shape.point, offset);
        });
    }

    // Unlock any locked shapes
    shapesToMove.forEach(shape => {
        if (shape.isLocked) {
            shape.isLocked = false;
        }
    });

    return {
        id: 'duplicate',
        before: {
            document: {
                pages: {
                    [currentPageId]: before,
                },
                pageStates: {
                    [currentPageId]: { selectedIds },
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
                        selectedIds: Array.from(dupedShapeIds.values()).map(
                            id => duplicateMap[id]
                        ),
                    },
                },
            },
        },
    };
}
