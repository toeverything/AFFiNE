import { FlipType } from '@toeverything/components/board-types';
import { TLBoundsCorner, Utils } from '@tldraw/core';
import type { TldrawCommand } from '@toeverything/components/board-types';
import type { TldrawApp } from '@toeverything/components/board-state';
import { TLDR } from '@toeverything/components/board-state';

export function flipShapes(
    app: TldrawApp,
    ids: string[],
    type: FlipType
): TldrawCommand {
    const { selectedIds, currentPageId, shapes } = app;

    const boundsForShapes = shapes.map(shape => TLDR.get_bounds(shape));

    const commonBounds = Utils.getCommonBounds(boundsForShapes);

    const { before, after } = TLDR.mutate_shapes(
        app.state,
        ids,
        shape => {
            const shapeBounds = TLDR.get_bounds(shape);

            switch (type) {
                case FlipType.Horizontal: {
                    const newShapeBounds =
                        Utils.getRelativeTransformedBoundingBox(
                            commonBounds,
                            commonBounds,
                            shapeBounds,
                            true,
                            false
                        );

                    return TLDR.get_shape_util(shape).transform(
                        shape,
                        newShapeBounds,
                        {
                            type: TLBoundsCorner.TopLeft,
                            scaleX: -1,
                            scaleY: 1,
                            initialShape: shape,
                            transformOrigin: [0.5, 0.5],
                        }
                    );
                }
                case FlipType.Vertical: {
                    const newShapeBounds =
                        Utils.getRelativeTransformedBoundingBox(
                            commonBounds,
                            commonBounds,
                            shapeBounds,
                            false,
                            true
                        );

                    return TLDR.get_shape_util(shape).transform(
                        shape,
                        newShapeBounds,
                        {
                            type: TLBoundsCorner.TopLeft,
                            scaleX: 1,
                            scaleY: -1,
                            initialShape: shape,
                            transformOrigin: [0.5, 0.5],
                        }
                    );
                }
            }
        },
        currentPageId
    );

    return {
        id: 'flip',
        before: {
            document: {
                pages: {
                    [currentPageId]: { shapes: before },
                },
                pageStates: {
                    [currentPageId]: {
                        selectedIds,
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
