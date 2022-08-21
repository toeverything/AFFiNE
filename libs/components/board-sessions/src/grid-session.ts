/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { TLBounds, TLPageState, Utils } from '@tldraw/core';
import { Vec } from '@tldraw/vec';
import type { TldrawApp } from '@toeverything/components/board-state';
import {
    Patch,
    SessionType,
    TDShape,
    TDStatus,
    TldrawCommand,
    TldrawPatch,
} from '@toeverything/components/board-types';
import { BaseSession } from './base-session';

export class GridSession extends BaseSession {
    type = SessionType.Grid;
    performanceMode: undefined;
    status = TDStatus.Translating;
    shape: TDShape;
    bounds: TLBounds;
    initialSelectedIds: string[];
    initialSiblings?: string[];
    grid: Record<string, string> = {};
    columns = 1;
    rows = 1;
    isCopying = false;

    constructor(app: TldrawApp, id: string) {
        super(app);
        this.shape = this.app.getShape(id);
        this.grid['0_0'] = this.shape.id;
        this.bounds = this.app.getShapeBounds(id);
        this.initialSelectedIds = [...this.app.selectedIds];
        if (this.shape.parentId !== this.app.currentPageId) {
            this.initialSiblings = this.app
                .getShape(this.shape.parentId)
                .children?.filter(id => id !== this.shape.id);
        }
    }

    start = (): TldrawPatch | undefined => void null;

    update = (): TldrawPatch | undefined => {
        const { currentPageId, altKey, shiftKey, currentPoint } = this.app;

        const nextShapes: Patch<Record<string, TDShape>> = {};

        const nextPageState: Patch<TLPageState> = {};

        const center = Utils.getBoundsCenter(this.bounds);

        const offset = Vec.sub(currentPoint, center);

        if (shiftKey) {
            if (Math.abs(offset[0]) < Math.abs(offset[1])) {
                offset[0] = 0;
            } else {
                offset[1] = 0;
            }
        }
        // use the distance from center to determine the grid

        const gapX = this.bounds.width + 32;
        const gapY = this.bounds.height + 32;

        const columns = Math.ceil(offset[0] / gapX);
        const rows = Math.ceil(offset[1] / gapY);

        const minX = Math.min(columns, 0);
        const minY = Math.min(rows, 0);
        const maxX = Math.max(columns, 1);
        const maxY = Math.max(rows, 1);

        const inGrid = new Set<string>();

        const isCopying = altKey;

        if (isCopying !== this.isCopying) {
            // Recreate shapes copying
            Object.values(this.grid)
                .filter(id => id !== this.shape.id)
                .forEach(id => (nextShapes[id] = undefined));

            this.grid = { '0_0': this.shape.id };

            this.isCopying = isCopying;
        }

        // Go through grid, adding items in positions
        // that aren't already filled.
        for (let x = minX; x < maxX; x++) {
            for (let y = minY; y < maxY; y++) {
                const position = `${x}_${y}`;

                inGrid.add(position);

                if (this.grid[position]) continue;

                if (x === 0 && y === 0) continue;

                const clone = this.get_clone(
                    Vec.add(this.shape.point, [x * gapX, y * gapY]),
                    isCopying
                );

                nextShapes[clone.id] = clone;

                this.grid[position] = clone.id;
            }
        }

        // Remove any other items from the grid
        Object.entries(this.grid).forEach(([position, id]) => {
            if (!inGrid.has(position)) {
                nextShapes[id] = undefined;
                delete this.grid[position];
            }
        });

        if (Object.values(nextShapes).length === 0) return;

        // Add shapes to parent id
        if (this.initialSiblings) {
            nextShapes[this.shape.parentId] = {
                children: [
                    ...this.initialSiblings,
                    ...Object.values(this.grid),
                ],
            };
        }

        return {
            document: {
                pages: {
                    [currentPageId]: {
                        shapes: nextShapes,
                    },
                },
                pageStates: {
                    [currentPageId]: nextPageState,
                },
            },
        };
    };

    cancel = (): TldrawPatch | undefined => {
        const { currentPageId } = this.app;
        const nextShapes: Record<string, Partial<TDShape> | undefined> = {};

        // Delete clones
        Object.values(this.grid).forEach(id => {
            nextShapes[id] = undefined;
            // TODO: Remove from parent if grouped
        });

        // Put back the initial shape
        nextShapes[this.shape.id] = {
            ...nextShapes[this.shape.id],
            point: this.shape.point,
        };

        if (this.initialSiblings) {
            nextShapes[this.shape.parentId] = {
                children: [...this.initialSiblings, this.shape.id],
            };
        }

        return {
            document: {
                pages: {
                    [currentPageId]: {
                        shapes: nextShapes,
                    },
                },
                pageStates: {
                    [currentPageId]: {
                        selectedIds: [this.shape.id],
                    },
                },
            },
        };
    };

    complete = (): TldrawPatch | TldrawCommand | undefined => {
        const { currentPageId } = this.app;

        const beforeShapes: Patch<Record<string, TDShape>> = {};

        const afterShapes: Patch<Record<string, TDShape>> = {};

        const afterSelectedIds: string[] = [];

        Object.values(this.grid).forEach(id => {
            beforeShapes[id] = undefined;
            afterShapes[id] = this.app.getShape(id);
            afterSelectedIds.push(id);
            // TODO: Add shape to parent if grouped
        });

        beforeShapes[this.shape.id] = this.shape;

        // Add shapes to parent id
        if (this.initialSiblings) {
            beforeShapes[this.shape.parentId] = {
                children: [...this.initialSiblings, this.shape.id],
            };

            afterShapes[this.shape.parentId] = {
                children: [
                    ...this.initialSiblings,
                    ...Object.values(this.grid),
                ],
            };
        }

        // If no new shapes have been created, bail
        if (afterSelectedIds.length === 1) return;

        return {
            id: 'grid',
            before: {
                document: {
                    pages: {
                        [currentPageId]: {
                            shapes: beforeShapes,
                        },
                    },
                    pageStates: {
                        [currentPageId]: {
                            selectedIds: [],
                            hoveredId: undefined,
                        },
                    },
                },
            },
            after: {
                document: {
                    pages: {
                        [currentPageId]: {
                            shapes: afterShapes,
                        },
                    },
                    pageStates: {
                        [currentPageId]: {
                            selectedIds: afterSelectedIds,
                            hoveredId: undefined,
                        },
                    },
                },
            },
        };
    };

    private get_clone = (point: number[], copy: boolean) => {
        const clone = {
            ...this.shape,
            id: Utils.uniqueId(),
            point,
        };

        // if (!copy) {
        //     if (clone.type === TDShapeType.Sticky) {
        //         clone.text = '';
        //     }
        // }

        return clone;
    };
}
