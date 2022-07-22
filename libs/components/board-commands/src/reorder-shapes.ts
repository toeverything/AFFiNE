import {
    MoveType,
    TDShape,
    TldrawCommand,
} from '@toeverything/components/board-types';
import { TLDR } from '@toeverything/components/board-state';
import type { TldrawApp } from '@toeverything/components/board-state';

export function reorderShapes(
    app: TldrawApp,
    ids: string[],
    type: MoveType
): TldrawCommand {
    const { currentPageId, page } = app;

    // Get the unique parent ids for the selected elements
    const parentIds = new Set(ids.map(id => app.getShape(id).parentId));

    let result: {
        before: Record<string, Partial<TDShape>>;
        after: Record<string, Partial<TDShape>>;
    } = { before: {}, after: {} };

    let startIndex: number;
    let startChildIndex: number;
    let step: number;

    // Collect shapes with common parents into a table under their parent id
    Array.from(parentIds.values()).forEach(parentId => {
        let sortedChildren: TDShape[] = [];
        if (parentId === page.id) {
            sortedChildren = Object.values(page.shapes).sort(
                (a, b) => a.childIndex - b.childIndex
            );
        } else {
            const parent = app.getShape(parentId);
            if (!parent.children) throw Error('No children in parent!');

            sortedChildren = parent.children
                .map(childId => app.getShape(childId))
                .sort((a, b) => a.childIndex - b.childIndex);
        }

        const sortedChildIds = sortedChildren.map(shape => shape.id);

        const sortedIndicesToMove = ids
            .filter(id => sortedChildIds.includes(id))
            .map(id => sortedChildIds.indexOf(id))
            .sort((a, b) => a - b);

        if (sortedIndicesToMove.length === sortedChildIds.length) return;

        switch (type) {
            case MoveType.ToBack: {
                //               a       b  c
                // Initial   1   2    3  4  5  6  7
                // Final   .25  .5  .75  1  3  6  7
                //           a   b    c

                // Find the lowest "open" index
                for (let i = 0; i < sortedChildIds.length; i++) {
                    if (sortedIndicesToMove.includes(i)) continue;
                    startIndex = i;
                    break;
                }

                // Find the lowest child index that isn't in sortedIndicesToMove
                startChildIndex = sortedChildren[startIndex].childIndex;

                // Find the step for each additional child
                step = startChildIndex / (sortedIndicesToMove.length + 1);

                // Get the results of moving the selected shapes below the first open index's shape
                result = TLDR.mutate_shapes(
                    app.state,
                    sortedIndicesToMove
                        .map(i => sortedChildren[i].id)
                        .reverse(),
                    (shape, i) => ({
                        childIndex: startChildIndex - (i + 1) * step,
                    }),
                    currentPageId
                );

                break;
            }
            case MoveType.ToFront: {
                //              a     b  c
                // Initial   1  2  3  4  5  6   7
                // Final     1  3  6  7  8  9  10
                //                       a  b   c

                // Find the highest "open" index
                for (let i = sortedChildIds.length - 1; i >= 0; i--) {
                    if (sortedIndicesToMove.includes(i)) continue;
                    startIndex = i;
                    break;
                }

                // Find the lowest child index that isn't in sortedIndicesToMove
                startChildIndex = sortedChildren[startIndex].childIndex;

                // Find the step for each additional child
                step = 1;

                // Get the results of moving the selected shapes below the first open index's shape
                result = TLDR.mutate_shapes(
                    app.state,
                    sortedIndicesToMove.map(i => sortedChildren[i].id),
                    (shape, i) => ({
                        childIndex: startChildIndex + (i + 1),
                    }),
                    currentPageId
                );

                break;
            }
            case MoveType.Backward: {
                //               a           b  c
                // Initial    1  2     3     4  5  6  7
                // Final     .5  1  1.66  2.33  3  6  7
                //           a         b     c

                const indexMap: Record<string, number> = {};

                // Starting from the top...
                for (let i = sortedChildIds.length - 1; i >= 0; i--) {
                    // If we found a moving index...
                    if (sortedIndicesToMove.includes(i)) {
                        for (let j = i; j >= 0; j--) {
                            // iterate downward until we find an open spot
                            if (!sortedIndicesToMove.includes(j)) {
                                // i = the index of the first closed spot
                                // j = the index of the first open spot

                                const endChildIndex =
                                    sortedChildren[j].childIndex;
                                let startChildIndex: number;
                                let step: number;

                                if (j === 0) {
                                    // We're moving below the first child, start from
                                    // half of its child index.

                                    startChildIndex = endChildIndex / 2;
                                    step = endChildIndex / 2 / (i - j + 1);
                                } else {
                                    // Start from the child index of the child below the
                                    // child above.
                                    startChildIndex =
                                        sortedChildren[j - 1].childIndex;
                                    step =
                                        (endChildIndex - startChildIndex) /
                                        (i - j + 1);
                                    startChildIndex += step;
                                }

                                for (let k = 0; k < i - j; k++) {
                                    indexMap[sortedChildren[j + k + 1].id] =
                                        startChildIndex + step * k;
                                }

                                break;
                            }
                        }
                    }
                }

                if (Object.values(indexMap).length > 0) {
                    // Get the results of moving the selected shapes below the first open index's shape
                    result = TLDR.mutate_shapes(
                        app.state,
                        sortedIndicesToMove.map(i => sortedChildren[i].id),
                        shape => ({
                            childIndex: indexMap[shape.id],
                        }),
                        currentPageId
                    );
                }

                break;
            }
            case MoveType.Forward: {
                //             a     b c
                // Initial   1 2   3 4 5 6 7
                // Final     1 3 3.5 6 7 8 9
                //                 a     b c

                const indexMap: Record<string, number> = {};

                // Starting from the top...
                for (let i = 0; i < sortedChildIds.length; i++) {
                    // If we found a moving index...
                    if (sortedIndicesToMove.includes(i)) {
                        // Search for the first open spot above this one
                        for (let j = i; j < sortedChildIds.length; j++) {
                            if (!sortedIndicesToMove.includes(j)) {
                                // i = the low index of the first closed spot
                                // j = the high index of the first open spot

                                startChildIndex = sortedChildren[j].childIndex;

                                const step =
                                    j === sortedChildIds.length - 1
                                        ? 1
                                        : (sortedChildren[j + 1].childIndex -
                                              startChildIndex) /
                                          (j - i + 1);

                                for (let k = 0; k < j - i; k++) {
                                    indexMap[sortedChildren[i + k].id] =
                                        startChildIndex + step * (k + 1);
                                }

                                break;
                            }
                        }
                    }
                }

                if (Object.values(indexMap).length > 0) {
                    // Get the results of moving the selected shapes below the first open index's shape
                    result = TLDR.mutate_shapes(
                        app.state,
                        sortedIndicesToMove.map(i => sortedChildren[i].id),
                        shape => ({
                            childIndex: indexMap[shape.id],
                        }),
                        currentPageId
                    );
                }

                break;
            }
        }
    });

    return {
        id: 'move',
        before: {
            document: {
                pages: {
                    [currentPageId]: { shapes: result.before },
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
                    [currentPageId]: { shapes: result.after },
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
