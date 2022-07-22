/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
    TLPageState,
    Utils,
    TLBoundsWithCenter,
    TLSnapLine,
    TLBounds,
} from '@tldraw/core';
import { Vec } from '@tldraw/vec';
import {
    TDShape,
    TDBinding,
    TldrawCommand,
    TDStatus,
    ArrowShape,
    Patch,
    GroupShape,
    SessionType,
    ArrowBinding,
    TldrawPatch,
    TDShapeType,
    SLOW_SPEED,
    SNAP_DISTANCE,
} from '@toeverything/components/board-types';
import { TLDR } from '@toeverything/components/board-state';
import { BaseSession } from './base-session';
import type { TldrawApp } from '@toeverything/components/board-state';

type CloneInfo =
    | {
          state: 'empty';
      }
    | {
          state: 'ready';
          cloneMap: Record<string, string>;
          clones: TDShape[];
          clonedBindings: ArrowBinding[];
      };

type SnapInfo =
    | {
          state: 'empty';
      }
    | {
          state: 'ready';
          others: TLBoundsWithCenter[];
          bounds: TLBoundsWithCenter[];
      };

export class TranslateSession extends BaseSession {
    performanceMode: undefined;
    type = SessionType.Translate;
    status = TDStatus.Translating;
    delta = [0, 0];
    prev = [0, 0];
    prevPoint = [0, 0];
    speed = 1;
    cloneInfo: CloneInfo = {
        state: 'empty',
    };
    snapInfo: SnapInfo = {
        state: 'empty',
    };
    snapLines: TLSnapLine[] = [];
    isCloning = false;
    isCreate: boolean;
    link: 'left' | 'right' | 'center' | false;

    initialIds: Set<string>;
    hasUnlockedShapes: boolean;
    initialSelectedIds: string[];
    initialCommonBounds: TLBounds;
    initialShapes: TDShape[];
    initialParentChildren: Record<string, string[]>;
    bindingsToDelete: ArrowBinding[];

    constructor(
        app: TldrawApp,
        isCreate = false,
        link: 'left' | 'right' | 'center' | false = false
    ) {
        super(app);
        this.isCreate = isCreate;
        this.link = link;

        const { currentPageId, selectedIds, page } = this.app;
        this.initialSelectedIds = [...selectedIds];

        const selectedShapes = (
            link
                ? TLDR.get_linked_shape_ids(
                      this.app.state,
                      currentPageId,
                      link,
                      false
                  )
                : selectedIds
        )
            .map(id => this.app.getShape(id))
            .filter(shape => !shape.isLocked);

        const selectedShapeIds = new Set(selectedShapes.map(shape => shape.id));

        selectedIds.forEach(item => {
            // let shap = this.app.page.shapes[selectedIds[]];
            const shap = this.app.getShape(item);
            if (shap.type === TDShapeType.Frame) {
                Object.entries(this.app.page.shapes).map(([id, shapItem]) => {
                    if (id !== shap.id) {
                        if (
                            Utils.boundsContain(
                                TLDR.get_bounds(shap),
                                TLDR.get_bounds(shapItem)
                            )
                        ) {
                            selectedShapes.push(shapItem);
                        }
                    }
                });
            }
        });

        // }
        this.hasUnlockedShapes = selectedShapes.length > 0;
        this.initialShapes = Array.from(
            new Set(
                selectedShapes
                    .filter(shape => !selectedShapeIds.has(shape.parentId))
                    .flatMap(shape => {
                        return shape.children
                            ? [
                                  shape,
                                  ...shape.children.map(childId =>
                                      this.app.getShape(childId)
                                  ),
                              ]
                            : [shape];
                    })
            ).values()
        );

        this.initialIds = new Set(this.initialShapes.map(shape => shape.id));

        this.bindingsToDelete = [];

        Object.values(page.bindings)
            .filter(
                binding =>
                    this.initialIds.has(binding.fromId) ||
                    this.initialIds.has(binding.toId)
            )
            .forEach(binding => {
                if (this.initialIds.has(binding.fromId)) {
                    if (!this.initialIds.has(binding.toId)) {
                        this.bindingsToDelete.push(binding);
                    }
                }
            });

        this.initialParentChildren = {};

        this.initialShapes
            .map(s => s.parentId)
            .filter(id => id !== page.id)
            .forEach(id => {
                this.initialParentChildren[id] =
                    this.app.getShape(id).children!;
            });

        this.initialCommonBounds = Utils.getCommonBounds(
            this.initialShapes.map(TLDR.get_rotated_bounds)
        );

        this.app.rotationInfo.selectedIds = [...this.app.selectedIds];
    }

    start = (): TldrawPatch | undefined => {
        const {
            bindingsToDelete,
            initialIds,
            app: { currentPageId, page },
        } = this;

        const allBounds: TLBoundsWithCenter[] = [];
        const otherBounds: TLBoundsWithCenter[] = [];

        Object.values(page.shapes).forEach(shape => {
            const bounds = Utils.getBoundsWithCenter(
                TLDR.get_rotated_bounds(shape)
            );
            allBounds.push(bounds);
            if (!initialIds.has(shape.id)) {
                otherBounds.push(bounds);
            }
        });

        this.snapInfo = {
            state: 'ready',
            bounds: allBounds,
            others: otherBounds,
        };

        if (bindingsToDelete.length === 0) return;

        const nextBindings: Patch<Record<string, TDBinding>> = {};

        bindingsToDelete.forEach(
            binding => (nextBindings[binding.id] = undefined)
        );

        return {
            document: {
                pages: {
                    [currentPageId]: {
                        bindings: nextBindings,
                    },
                },
            },
        };
    };

    update = (): TldrawPatch | undefined => {
        const {
            initialParentChildren,
            initialShapes,
            initialCommonBounds,
            bindingsToDelete,
            app: {
                pageState: { camera },
                settings: { isSnapping, showGrid },
                currentPageId,
                viewport,
                selectedIds,
                currentPoint,
                previousPoint,
                originPoint,
                altKey,
                shiftKey,
                metaKey,
                currentGrid,
            },
        } = this;

        const nextBindings: Patch<Record<string, TDBinding>> = {};
        const nextShapes: Patch<Record<string, TDShape>> = {};
        const nextPageState: Patch<TLPageState> = {};

        let delta = Vec.sub(currentPoint, originPoint);

        let didChangeCloning = false;

        if (!this.isCreate) {
            if (altKey && !this.isCloning) {
                this.isCloning = true;
                didChangeCloning = true;
            } else if (!altKey && this.isCloning) {
                this.isCloning = false;
                didChangeCloning = true;
            }
        }

        if (shiftKey) {
            if (Math.abs(delta[0]) < Math.abs(delta[1])) {
                delta[0] = 0;
            } else {
                delta[1] = 0;
            }
        }

        // Should we snap?

        // Speed is used to decide which snap points to use. At a high
        // speed, we don't use any snap points. At a low speed, we only
        // allow center-to-center snap points. At very low speed, we
        // enable all snap points (still preferring middle snaps). We're
        // using an acceleration function here to smooth the changes in
        // speed, but we also want the speed to accelerate faster than
        // it decelerates.

        const speed = Vec.dist(currentPoint, previousPoint);

        const change = speed - this.speed;

        this.speed = this.speed + change * (change > 1 ? 0.5 : 0.15);

        this.snapLines = [];

        if (
            ((isSnapping && !metaKey) || (!isSnapping && metaKey)) &&
            this.speed * camera.zoom < SLOW_SPEED &&
            this.snapInfo.state === 'ready'
        ) {
            const snapResult = Utils.getSnapPoints(
                Utils.getBoundsWithCenter(
                    showGrid
                        ? Utils.snapBoundsToGrid(
                              Utils.translateBounds(initialCommonBounds, delta),
                              currentGrid
                          )
                        : Utils.translateBounds(initialCommonBounds, delta)
                ),
                (this.isCloning
                    ? this.snapInfo.bounds
                    : this.snapInfo.others
                ).filter(bounds => {
                    return (
                        Utils.boundsContain(viewport, bounds) ||
                        Utils.boundsCollide(viewport, bounds)
                    );
                }),
                SNAP_DISTANCE / camera.zoom
            );

            if (snapResult) {
                this.snapLines = snapResult.snapLines;
                delta = Vec.sub(delta, snapResult.offset);
            }
        }

        // We've now calculated the "delta", or difference between the
        // cursor's position (real or adjusted by snaps or axis locking)
        // and the cursor's original position ("origin").

        // The "movement" is the actual change of position between this
        // computed position and the previous computed position.

        this.prev = delta;

        // If cloning...
        if (this.isCloning) {
            // Not Cloning -> Cloning
            if (didChangeCloning) {
                if (this.cloneInfo.state === 'empty') {
                    this.create_clone_info();
                }

                if (this.cloneInfo.state === 'empty') {
                    throw Error;
                }

                const { clones, clonedBindings } = this.cloneInfo;

                this.isCloning = true;

                // Put back any bindings we deleted
                bindingsToDelete.forEach(
                    binding => (nextBindings[binding.id] = binding)
                );

                // Move original shapes back to start
                initialShapes.forEach(
                    shape => (nextShapes[shape.id] = { point: shape.point })
                );

                // Add the clones to the page
                clones.forEach(clone => {
                    nextShapes[clone.id] = { ...clone };

                    // Add clones to non-selected parents
                    if (
                        clone.parentId !== currentPageId &&
                        !selectedIds.includes(clone.parentId)
                    ) {
                        const children =
                            nextShapes[clone.parentId]?.children ||
                            initialParentChildren[clone.parentId];

                        if (!children.includes(clone.id)) {
                            nextShapes[clone.parentId] = {
                                ...nextShapes[clone.parentId],
                                children: [...children, clone.id],
                            };
                        }
                    }
                });

                // Add the cloned bindings
                for (const binding of clonedBindings) {
                    nextBindings[binding.id] = binding;
                }

                // Set the selected ids to the clones
                nextPageState.selectedIds = clones.map(clone => clone.id);

                // Either way, move the clones
                clones.forEach(clone => {
                    nextShapes[clone.id] = {
                        ...clone,
                        point: showGrid
                            ? Vec.snap(
                                  Vec.toFixed(Vec.add(clone.point, delta)),
                                  currentGrid
                              )
                            : Vec.toFixed(Vec.add(clone.point, delta)),
                    };
                });
            } else {
                if (this.cloneInfo.state === 'empty') throw Error;

                const { clones } = this.cloneInfo;

                clones.forEach(clone => {
                    nextShapes[clone.id] = {
                        point: showGrid
                            ? Vec.snap(
                                  Vec.toFixed(Vec.add(clone.point, delta)),
                                  currentGrid
                              )
                            : Vec.toFixed(Vec.add(clone.point, delta)),
                    };
                });
            }
        } else {
            // If not cloning...

            // Cloning -> Not Cloning
            if (didChangeCloning) {
                if (this.cloneInfo.state === 'empty') throw Error;

                const { clones, clonedBindings } = this.cloneInfo;

                this.isCloning = false;

                // Delete the bindings
                bindingsToDelete.forEach(
                    binding => (nextBindings[binding.id] = undefined)
                );

                // Remove the clones from parents
                clones.forEach(clone => {
                    if (clone.parentId !== currentPageId) {
                        nextShapes[clone.parentId] = {
                            ...nextShapes[clone.parentId],
                            children: initialParentChildren[clone.parentId],
                        };
                    }
                });

                // Delete the clones (including any parent clones)
                clones.forEach(clone => (nextShapes[clone.id] = undefined));

                // Move the original shapes back to the cursor position
                initialShapes.forEach(shape => {
                    nextShapes[shape.id] = {
                        point: showGrid
                            ? Vec.snap(
                                  Vec.toFixed(Vec.add(shape.point, delta)),
                                  currentGrid
                              )
                            : Vec.toFixed(Vec.add(shape.point, delta)),
                    };
                });

                // Delete the cloned bindings
                for (const binding of clonedBindings) {
                    nextBindings[binding.id] = undefined;
                }

                // Set selected ids
                nextPageState.selectedIds = initialShapes.map(
                    shape => shape.id
                );
            } else {
                // Move the shapes by the delta
                initialShapes.forEach(shape => {
                    // const current = (nextShapes[shape.id] || this.app.getShape(shape.id)) as TDShape

                    nextShapes[shape.id] = {
                        point: showGrid
                            ? Vec.snap(
                                  Vec.toFixed(Vec.add(shape.point, delta)),
                                  currentGrid
                              )
                            : Vec.toFixed(Vec.add(shape.point, delta)),
                    };
                });
            }
        }

        return {
            appState: {
                snapLines: this.snapLines,
            },
            document: {
                pages: {
                    [currentPageId]: {
                        shapes: nextShapes,
                        bindings: nextBindings,
                    },
                },
                pageStates: {
                    [currentPageId]: nextPageState,
                },
            },
        };
    };

    cancel = (): TldrawPatch | undefined => {
        const {
            initialShapes,
            initialSelectedIds,
            bindingsToDelete,
            app: { currentPageId },
        } = this;

        const nextBindings: Record<string, Partial<TDBinding> | undefined> = {};
        const nextShapes: Record<string, Partial<TDShape> | undefined> = {};
        const nextPageState: Partial<TLPageState> = {
            editingId: undefined,
            hoveredId: undefined,
        };

        // Put back any deleted bindings
        bindingsToDelete.forEach(
            binding => (nextBindings[binding.id] = binding)
        );

        if (this.isCreate) {
            initialShapes.forEach(({ id }) => (nextShapes[id] = undefined));
            nextPageState.selectedIds = [];
        } else {
            // Put initial shapes back to where they started
            initialShapes.forEach(
                ({ id, point }) =>
                    (nextShapes[id] = { ...nextShapes[id], point })
            );
            nextPageState.selectedIds = initialSelectedIds;
        }

        if (this.cloneInfo.state === 'ready') {
            const { clones, clonedBindings } = this.cloneInfo;
            // Delete clones
            clones.forEach(clone => (nextShapes[clone.id] = undefined));

            // Delete cloned bindings
            clonedBindings.forEach(
                binding => (nextBindings[binding.id] = undefined)
            );
        }

        return {
            appState: {
                snapLines: [],
            },
            document: {
                pages: {
                    [currentPageId]: {
                        shapes: nextShapes,
                        bindings: nextBindings,
                    },
                },
                pageStates: {
                    [currentPageId]: nextPageState,
                },
            },
        };
    };

    complete = (): TldrawPatch | TldrawCommand | undefined => {
        const {
            initialShapes,
            initialParentChildren,
            bindingsToDelete,
            app: { currentPageId },
        } = this;

        const beforeBindings: Patch<Record<string, TDBinding>> = {};
        const beforeShapes: Patch<Record<string, TDShape>> = {};

        const afterBindings: Patch<Record<string, TDBinding>> = {};
        const afterShapes: Patch<Record<string, TDShape>> = {};

        if (this.isCloning) {
            if (this.cloneInfo.state === 'empty') {
                this.create_clone_info();
            }

            if (this.cloneInfo.state !== 'ready') throw Error;
            const { clones, clonedBindings } = this.cloneInfo;

            // Update the clones
            clones.forEach(clone => {
                beforeShapes[clone.id] = undefined;

                afterShapes[clone.id] = this.app.getShape(clone.id);

                if (clone.parentId !== currentPageId) {
                    beforeShapes[clone.parentId] = {
                        ...beforeShapes[clone.parentId],
                        children: initialParentChildren[clone.parentId],
                    };

                    afterShapes[clone.parentId] = {
                        ...afterShapes[clone.parentId],
                        children: this.app.getShape<GroupShape>(clone.parentId)
                            .children,
                    };
                }
            });

            // Update the cloned bindings
            clonedBindings.forEach(binding => {
                beforeBindings[binding.id] = undefined;
                afterBindings[binding.id] = this.app.getBinding(binding.id);
            });
        } else {
            // If we aren't cloning, then update the initial shapes
            initialShapes.forEach(shape => {
                beforeShapes[shape.id] = this.isCreate
                    ? undefined
                    : {
                          ...beforeShapes[shape.id],
                          point: shape.point,
                      };

                afterShapes[shape.id] = {
                    ...afterShapes[shape.id],
                    ...(this.isCreate
                        ? this.app.getShape(shape.id)
                        : { point: this.app.getShape(shape.id).point }),
                };
            });
        }

        // Update the deleted bindings and any associated shapes
        bindingsToDelete.forEach(binding => {
            beforeBindings[binding.id] = binding;

            for (const id of [binding.toId, binding.fromId]) {
                // Let's also look at the bound shape...
                const shape = this.app.getShape(id);

                // If the bound shape has a handle that references the deleted binding, delete that reference
                if (!shape.handles) continue;

                Object.values(shape.handles)
                    .filter(handle => handle.bindingId === binding.id)
                    .forEach(handle => {
                        beforeShapes[id] = { ...beforeShapes[id], handles: {} };

                        afterShapes[id] = { ...afterShapes[id], handles: {} };

                        // There should be before and after shapes

                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        beforeShapes[id]!.handles![
                            handle.id as keyof ArrowShape['handles']
                        ] = {
                            bindingId: binding.id,
                        };

                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        afterShapes[id]!.handles![
                            handle.id as keyof ArrowShape['handles']
                        ] = {
                            bindingId: undefined,
                        };
                    });
            }
        });

        return {
            id: 'translate',
            before: {
                appState: {
                    snapLines: [],
                },
                document: {
                    pages: {
                        [currentPageId]: {
                            shapes: beforeShapes,
                            bindings: beforeBindings,
                        },
                    },
                    pageStates: {
                        [currentPageId]: {
                            selectedIds: this.isCreate
                                ? []
                                : [...this.initialSelectedIds],
                        },
                    },
                },
            },
            after: {
                appState: {
                    snapLines: [],
                },
                document: {
                    pages: {
                        [currentPageId]: {
                            shapes: afterShapes,
                            bindings: afterBindings,
                        },
                    },
                    pageStates: {
                        [currentPageId]: {
                            selectedIds: [...this.app.selectedIds],
                        },
                    },
                },
            },
        };
    };

    private create_clone_info = () => {
        // Create clones when as they're needed.
        // Consider doing this work in a worker.

        const {
            initialShapes,
            initialParentChildren,
            app: { selectedIds, currentPageId, page },
        } = this;

        const cloneMap: Record<string, string> = {};
        const clonedBindingsMap: Record<string, string> = {};
        const clonedBindings: TDBinding[] = [];

        // Create clones of selected shapes
        const clones: TDShape[] = [];

        initialShapes.forEach(shape => {
            const newId = Utils.uniqueId();

            initialParentChildren[newId] = initialParentChildren[shape.id];

            cloneMap[shape.id] = newId;

            const clone = {
                ...Utils.deepClone(shape),
                id: newId,
                parentId: shape.parentId,
                childIndex: TLDR.get_child_index_above(
                    this.app.state,
                    shape.id,
                    currentPageId
                ),
            };

            if (clone.type === TDShapeType.Video) {
                const element = document.getElementById(
                    shape.id + '_video'
                ) as HTMLVideoElement;
                if (element)
                    clone.currentTime =
                        (element.currentTime + 16) % element.duration;
            }

            clones.push(clone);
        });

        clones.forEach(clone => {
            if (clone.children !== undefined) {
                clone.children = clone.children.map(
                    childId => cloneMap[childId]
                );
            }
        });

        clones.forEach(clone => {
            if (selectedIds.includes(clone.parentId)) {
                clone.parentId = cloneMap[clone.parentId];
            }
        });

        // Potentially confusing name here: these are the ids of the
        // original shapes that were cloned, not their clones' ids.
        const clonedShapeIds = new Set(Object.keys(cloneMap));

        // Create cloned bindings for shapes where both to and from shapes are selected
        // (if the user clones, then we will create a new binding for the clones)
        Object.values(page.bindings)
            .filter(
                binding =>
                    clonedShapeIds.has(binding.fromId) ||
                    clonedShapeIds.has(binding.toId)
            )
            .forEach(binding => {
                if (clonedShapeIds.has(binding.fromId)) {
                    if (clonedShapeIds.has(binding.toId)) {
                        const cloneId = Utils.uniqueId();
                        const cloneBinding = {
                            ...Utils.deepClone(binding),
                            id: cloneId,
                            fromId: cloneMap[binding.fromId] || binding.fromId,
                            toId: cloneMap[binding.toId] || binding.toId,
                        };
                        clonedBindingsMap[binding.id] = cloneId;
                        clonedBindings.push(cloneBinding);
                    }
                }
            });

        // Assign new binding ids to clones (or delete them!)
        clones.forEach(clone => {
            if (clone.handles) {
                if (clone.handles) {
                    for (const id in clone.handles) {
                        const handle =
                            clone.handles[id as keyof ArrowShape['handles']];
                        handle.bindingId = handle.bindingId
                            ? clonedBindingsMap[handle.bindingId]
                            : undefined;
                    }
                }
            }
        });

        clones.forEach(clone => {
            if (page.shapes[clone.id]) {
                throw Error("uh oh, we didn't clone correctly");
            }
        });

        this.cloneInfo = {
            state: 'ready',
            clones,
            cloneMap,
            clonedBindings,
        };
    };
}
