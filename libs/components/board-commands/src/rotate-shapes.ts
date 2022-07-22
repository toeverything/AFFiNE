import { Utils } from '@tldraw/core';
import type {
    TldrawCommand,
    TDShape,
} from '@toeverything/components/board-types';
import { TLDR } from '@toeverything/components/board-state';
import type { TldrawApp } from '@toeverything/components/board-state';

const PI2 = Math.PI * 2;

export function rotateShapes(
    app: TldrawApp,
    ids: string[],
    delta = -PI2 / 4
): TldrawCommand | void {
    const { currentPageId } = app;

    // The shapes for the before patch
    const before: Record<string, Partial<TDShape>> = {};

    // The shapes for the after patch
    const after: Record<string, Partial<TDShape>> = {};

    // Find the shapes that we want to rotate.
    // We don't rotate groups: we rotate their children instead.
    const shapesToRotate = ids
        .flatMap(id => {
            const shape = app.getShape(id);
            return shape.children
                ? shape.children.map(childId => app.getShape(childId))
                : shape;
        })
        .filter(shape => !shape.isLocked);

    // Find the common center to all shapes
    // This is the point that we'll rotate around
    const origin = Utils.getBoundsCenter(
        Utils.getCommonBounds(
            shapesToRotate.map(shape => TLDR.get_bounds(shape))
        )
    );

    // Find the rotate mutations for each shape
    shapesToRotate.forEach(shape => {
        const change = TLDR.get_rotated_shape_mutation(
            shape,
            TLDR.get_center(shape),
            origin,
            delta
        );
        if (!change) return;
        before[shape.id] = TLDR.get_before_shape(shape, change);
        after[shape.id] = change;
    });

    return {
        id: 'rotate',
        before: {
            document: {
                pages: {
                    [currentPageId]: { shapes: before },
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
                    [currentPageId]: { shapes: after },
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
