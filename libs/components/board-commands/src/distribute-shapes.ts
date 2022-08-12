/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Utils } from '@tldraw/core';
import Vec from '@tldraw/vec';
import type { TldrawApp } from '@toeverything/components/board-state';
import { TLDR } from '@toeverything/components/board-state';
import {
    DistributeType,
    TDShape,
    TDShapeType,
    TldrawCommand,
} from '@toeverything/components/board-types';

export function distributeShapes(
    app: TldrawApp,
    ids: string[],
    type: DistributeType
): TldrawCommand {
    const { currentPageId } = app;

    const initialShapes = ids.map(id => app.getShape(id));

    const deltaMap = Object.fromEntries(
        getDistributions(initialShapes, type).map(d => [d.id, d])
    );

    const { before, after } = TLDR.mutate_shapes(
        app.state,
        ids.filter(id => deltaMap[id] !== undefined),
        shape => ({ point: deltaMap[shape.id].next }),
        currentPageId
    );

    initialShapes.forEach(shape => {
        if (shape.type === TDShapeType.Group) {
            const delta = Vec.sub(
                after[shape.id].point!,
                before[shape.id].point!
            );

            shape.children.forEach(id => {
                const child = app.getShape(id);
                before[child.id] = { point: child.point };
                after[child.id] = { point: Vec.add(child.point, delta) };
            });

            delete before[shape.id];
            delete after[shape.id];
        }
    });

    return {
        id: 'distribute',
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

function getDistributions(initialShapes: TDShape[], type: DistributeType) {
    const entries = initialShapes.map(shape => {
        const utils = TLDR.get_shape_util(shape);
        return {
            id: shape.id,
            point: [...shape.point],
            bounds: utils.getBounds(shape),
            center: utils.getCenter(shape),
        };
    });

    const len = entries.length;
    const commonBounds = Utils.getCommonBounds(
        entries.map(({ bounds }) => bounds)
    );

    const results: { id: string; prev: number[]; next: number[] }[] = [];

    switch (type) {
        case DistributeType.Horizontal: {
            const span = entries.reduce((a, c) => a + c.bounds.width, 0);

            if (span > commonBounds.width) {
                const left = entries.sort(
                    (a, b) => a.bounds.minX - b.bounds.minX
                )[0];

                const right = entries.sort(
                    (a, b) => b.bounds.maxX - a.bounds.maxX
                )[0];

                const entriesToMove = entries
                    .filter(a => a !== left && a !== right)
                    .sort((a, b) => a.center[0] - b.center[0]);

                const step = (right.center[0] - left.center[0]) / (len - 1);

                const x = left.center[0] + step;

                entriesToMove.forEach(({ id, point, bounds }, i) => {
                    results.push({
                        id,
                        prev: point,
                        next: [x + step * i - bounds.width / 2, bounds.minY],
                    });
                });
            } else {
                const entriesToMove = entries.sort(
                    (a, b) => a.center[0] - b.center[0]
                );

                let x = commonBounds.minX;
                const step = (commonBounds.width - span) / (len - 1);

                entriesToMove.forEach(({ id, point, bounds }) => {
                    results.push({ id, prev: point, next: [x, bounds.minY] });
                    x += bounds.width + step;
                });
            }
            break;
        }
        case DistributeType.Vertical: {
            const span = entries.reduce((a, c) => a + c.bounds.height, 0);

            if (span > commonBounds.height) {
                const top = entries.sort(
                    (a, b) => a.bounds.minY - b.bounds.minY
                )[0];

                const bottom = entries.sort(
                    (a, b) => b.bounds.maxY - a.bounds.maxY
                )[0];

                const entriesToMove = entries
                    .filter(a => a !== top && a !== bottom)
                    .sort((a, b) => a.center[1] - b.center[1]);

                const step = (bottom.center[1] - top.center[1]) / (len - 1);

                const y = top.center[1] + step;

                entriesToMove.forEach(({ id, point, bounds }, i) => {
                    results.push({
                        id,
                        prev: point,
                        next: [bounds.minX, y + step * i - bounds.height / 2],
                    });
                });
            } else {
                const entriesToMove = entries.sort(
                    (a, b) => a.center[1] - b.center[1]
                );

                let y = commonBounds.minY;
                const step = (commonBounds.height - span) / (len - 1);

                entriesToMove.forEach(({ id, point, bounds }) => {
                    results.push({ id, prev: point, next: [bounds.minX, y] });
                    y += bounds.height + step;
                });
            }

            break;
        }
    }

    return results;
}
