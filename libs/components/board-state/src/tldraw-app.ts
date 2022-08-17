/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable no-restricted-syntax */
import {
    TLBounds,
    TLBoundsEventHandler,
    TLBoundsHandleEventHandler,
    TLCanvasEventHandler,
    TLDropEventHandler,
    TLKeyboardEventHandler,
    TLPageState,
    TLPinchEventHandler,
    TLPointerEventHandler,
    TLShapeCloneHandler,
    TLWheelEventHandler,
    Utils,
} from '@tldraw/core';
import { Vec } from '@tldraw/vec';
import {
    clearPrevSize,
    defaultStyle,
    shapeUtils,
} from '@toeverything/components/board-shapes';
import {
    AlignType,
    ArrowShape,
    BaseSessionType,
    DistributeType,
    FIT_TO_SCREEN_PADDING,
    FlipType,
    GRID_SIZE,
    GroupShape,
    IMAGE_EXTENSIONS,
    MoveType,
    SessionType,
    ShapeStyles,
    StretchType,
    SVG_EXPORT_PADDING,
    TDAsset,
    TDAssets,
    TDAssetType,
    TDBinding,
    TDDocument,
    TDExport,
    TDExportType,
    TDPage,
    TDShape,
    TDShapeType,
    TDSnapshot,
    TDStatus,
    TDToolType,
    TDUser,
    TldrawCommand,
    USER_COLORS,
    VIDEO_EXTENSIONS,
} from '@toeverything/components/board-types';
import { MIN_PAGE_WIDTH } from '@toeverything/components/editor-core';
import {
    FileSystemHandle,
    fileToBase64,
    fileToText,
    getImageSizeFromSrc,
    getVideoSizeFromSrc,
    loadFileHandle,
    migrate,
    openAssetFromFileSystem,
    openFromFileSystem,
    saveToFileSystem,
} from './data';
import { getClipboard, setClipboard } from './idb-clipboard';
import { StateManager } from './manager/state-manager';
import { TLDR } from './tldr';
import type { Commands } from './types/commands';
import type { BaseTool } from './types/tool';

const uuid = Utils.uniqueId();

interface TDCallbacks {
    /**
     * (optional) A callback to run when the component mounts.
     */
    onMount?: (app: TldrawApp) => void;
    /**
     * (optional) A callback to run when the component's state changes.
     */
    onChange?: (app: TldrawApp, reason?: string) => void;
    /**
     * (optional) A callback to run when the user creates a new project through the menu or through a keyboard shortcut.
     */
    onNewProject?: (app: TldrawApp, e?: KeyboardEvent) => void;
    /**
     * (optional) A callback to run when the user saves a project through the menu or through a keyboard shortcut.
     */
    onSaveProject?: (app: TldrawApp, e?: KeyboardEvent) => void;
    /**
     * (optional) A callback to run when the user saves a project as a new project through the menu or through a keyboard shortcut.
     */
    onSaveProjectAs?: (app: TldrawApp, e?: KeyboardEvent) => void;
    /**
     * (optional) A callback to run when the user opens new project through the menu or through a keyboard shortcut.
     */
    onOpenProject?: (app: TldrawApp, e?: KeyboardEvent) => void;
    /**
     * (optional) A callback to run when the opens a file to upload.
     */
    onOpenMedia?: (app: TldrawApp) => void;
    /**
     * (optional) A callback to run when the user signs in via the menu.
     */
    onSignIn?: (app: TldrawApp) => void;
    /**
     * (optional) A callback to run when the user signs out via the menu.
     */
    onSignOut?: (app: TldrawApp) => void;
    /**
     * (optional) A callback to run when the state is patched.
     */
    onPatch?: (app: TldrawApp, reason?: string) => void;
    /**
     * (optional) A callback to run when the state is changed with a command.
     */
    onCommand?: (app: TldrawApp, reason?: string) => void;
    /**
     * (optional) A callback to run when the state is persisted.
     */
    onPersist?: (app: TldrawApp) => void;
    /**
     * (optional) A callback to run when the user undos.
     */
    onUndo?: (app: TldrawApp) => void;
    /**
     * (optional) A callback to run when the user redos.
     */
    onRedo?: (app: TldrawApp) => void;
    /**
     * (optional) A callback to run when the user changes the current page's shapes.
     */
    onChangePage?: (
        app: TldrawApp,
        shapes: Record<string, TDShape | undefined>,
        bindings: Record<string, TDBinding | undefined>,
        assets: Record<string, TDAsset | undefined>
    ) => void;
    /**
     * (optional) A callback to run when the user creates a new project.
     */
    onChangePresence?: (app: TldrawApp, user: TDUser) => void;
    /**
     * (optional) A callback to run when an asset will be deleted.
     */
    onAssetDelete?: (app: TldrawApp, assetId: string) => void;
    /**
     * (optional) A callback to run when an asset will be created. Should return the value for the image/video's `src` property.
     */
    onAssetCreate?: (
        app: TldrawApp,
        file: File,
        id: string
    ) => Promise<string | false>;
    /**
     * (optional) A callback to run when an asset will be uploaded. Should return the value for the image/video's `src` property.
     */
    onAssetUpload?: (
        app: TldrawApp,
        file: File,
        id: string
    ) => Promise<string | false>;
    /**
     * (optional) A callback to run when the user exports their page or selection.
     */
    onExport?: (app: TldrawApp, info: TDExport) => Promise<void>;
    /**
     * (optional) A callback to run when the shape is copied.
     */
    onCopy?: (e: ClipboardEvent, ids: string[]) => void;
}

export interface TldrawAppCtorProps {
    id?: string;
    callbacks?: TDCallbacks;
    getSession: (type: SessionType) => {
        new (app: TldrawApp, ...args: any[]): BaseSessionType;
    };
    editorShapeInitSize?: number;
    commands: Commands;
    tools: Record<string, { new (app: TldrawApp): BaseTool }>;
}

export class TldrawApp extends StateManager<TDSnapshot> {
    callbacks: TDCallbacks = {};

    tools: Record<string, BaseTool> = {};

    commands: Commands;

    currentTool: BaseTool = this.tools['select'];

    session?: BaseSessionType;

    readOnly = false;

    isDirty = false;

    isCreating = false;

    originPoint = [0, 0];

    currentPoint = [0, 0];

    previousPoint = [0, 0];

    shiftKey = false;

    altKey = false;

    metaKey = false;

    ctrlKey = false;

    spaceKey = false;

    isPointing = false;

    editingStartTime = -1;

    fileSystemHandle: FileSystemHandle | null = null;

    editorShapeInitSize = MIN_PAGE_WIDTH;

    viewport = Utils.getBoundsFromPoints([
        [0, 0],
        [100, 100],
    ]);

    rendererBounds = Utils.getBoundsFromPoints([
        [0, 0],
        [100, 100],
    ]);

    selectHistory = {
        stack: [[]] as string[][],
        pointer: 0,
    };

    clipboard?: {
        shapes: TDShape[];
        bindings: TDBinding[];
        assets: TDAsset[];
    };

    rotationInfo = {
        selectedIds: [] as string[],
        center: [0, 0],
    };

    pasteInfo = {
        center: [0, 0],
        offset: [0, 0],
    };

    getSession: TldrawAppCtorProps['getSession'];

    constructor(props: TldrawAppCtorProps) {
        super(
            TldrawApp.defaultState,
            props.id,
            TldrawApp.version,
            (prev, next, prevVersion) => {
                return {
                    ...next,
                    document: migrate(
                        {
                            ...next.document,
                            ...prev.document,
                            version: prevVersion,
                        },
                        TldrawApp.version
                    ),
                };
            }
        );

        this.callbacks = props.callbacks || {};
        this.getSession = props.getSession;
        this.commands = props.commands;

        this.tools = Object.entries(props.tools).reduce((acc, [key, Tool]) => {
            acc[key] = new Tool(this);
            return acc;
        }, {} as Record<string, BaseTool>);
        this.currentTool = this.tools['select'];

        if (props.editorShapeInitSize) {
            this.editorShapeInitSize = props.editorShapeInitSize;
        }
    }

    /* -------------------- Internal -------------------- */

    protected override migrate = (state: TDSnapshot): TDSnapshot => {
        return {
            ...state,
            document: migrate(state.document, TldrawApp.version),
        };
    };

    protected override on_ready = () => {
        this.loadDocument(this.document);

        loadFileHandle().then(fileHandle => {
            this.fileSystemHandle = fileHandle;
        });

        try {
            this.patchState({
                appState: {
                    status: TDStatus.Idle,
                },
                document: migrate(this.document, TldrawApp.version),
            });
        } catch (e) {
            console.error('The data appears to be corrupted. Resetting!', e);
            localStorage.setItem(
                this.document.id + '_corrupted',
                JSON.stringify(this.document)
            );

            this.patchState({
                ...TldrawApp.defaultState,
                appState: {
                    ...TldrawApp.defaultState.appState,
                    status: TDStatus.Idle,
                },
            });
        }

        this.callbacks.onMount?.(this);
    };

    /**
     * Cleanup the state after each state change.
     * @param state The new state
     * @param prev The previous state
     * @protected
     * @returns The final state
     */
    protected override cleanup = (
        state: TDSnapshot,
        prev: TDSnapshot
    ): TDSnapshot => {
        const next: TDSnapshot = { ...state };

        // Remove deleted shapes and bindings (in Commands, these will be set to undefined)
        if (next.document !== prev.document) {
            Object.entries(next.document.pages).forEach(([pageId, page]) => {
                if (page === undefined) {
                    // If page is undefined, delete the page and pagestate
                    delete next.document.pages[pageId];
                    delete next.document.pageStates[pageId];
                    return;
                }

                const prevPage = prev.document.pages[pageId];

                const changedShapes: Record<string, TDShape | undefined> = {};

                if (
                    !prevPage ||
                    page.shapes !== prevPage.shapes ||
                    page.bindings !== prevPage.bindings
                ) {
                    page.shapes = { ...page.shapes };
                    page.bindings = { ...page.bindings };

                    const groupsToUpdate = new Set<GroupShape>();

                    // If shape is undefined, delete the shape
                    Object.entries(page.shapes).forEach(([id, shape]) => {
                        let parentId: string;

                        if (!shape) {
                            parentId = prevPage?.shapes[id]?.parentId;
                            delete page.shapes[id];
                        } else {
                            parentId = shape.parentId;
                        }

                        if (page.id === next.appState.currentPageId) {
                            if (prevPage?.shapes[id] !== shape) {
                                changedShapes[id] = shape;
                            }
                        }

                        // If the shape is the child of a group, then update the group
                        // (unless the group is being deleted too)
                        if (parentId && parentId !== pageId) {
                            const group = page.shapes[parentId];
                            if (group !== undefined) {
                                groupsToUpdate.add(
                                    page.shapes[parentId] as GroupShape
                                );
                            }
                        }
                    });

                    // If binding is undefined, delete the binding
                    Object.keys(page.bindings).forEach(id => {
                        if (!page.bindings[id]) {
                            delete page.bindings[id];
                        }
                    });

                    next.document.pages[pageId] = page;

                    // Get bindings related to the changed shapes
                    const bindingsToUpdate = TLDR.get_related_bindings(
                        next,
                        Object.keys(changedShapes),
                        pageId
                    );

                    const visitedShapes = new Set<ArrowShape>();

                    // Update all of the bindings we've just collected
                    bindingsToUpdate.forEach(binding => {
                        if (!page.bindings[binding.id]) {
                            return;
                        }

                        const toShape = page.shapes[binding.toId];
                        const fromShape = page.shapes[
                            binding.fromId
                        ] as ArrowShape;

                        if (!(toShape && fromShape)) {
                            delete next.document.pages[pageId].bindings[
                                binding.id
                            ];
                            return;
                        }

                        if (visitedShapes.has(fromShape)) {
                            return;
                        }

                        // We only need to update the binding's "from" shape (an arrow)
                        const fromDelta = TLDR.update_arrow_bindings(
                            page,
                            fromShape
                        );
                        visitedShapes.add(fromShape);

                        if (fromDelta) {
                            const nextShape = {
                                ...fromShape,
                                ...fromDelta,
                            } as ArrowShape;
                            page.shapes[fromShape.id] = nextShape;
                        }
                    });

                    groupsToUpdate.forEach(group => {
                        if (!group) throw Error('no group!');
                        const children = group.children.filter(
                            id => page.shapes[id] !== undefined
                        );

                        const commonBounds = Utils.getCommonBounds(
                            children
                                .map(id => page.shapes[id])
                                .filter(Boolean)
                                .map(shape => TLDR.get_rotated_bounds(shape))
                        );

                        page.shapes[group.id] = {
                            ...group,
                            point: [commonBounds.minX, commonBounds.minY],
                            size: [commonBounds.width, commonBounds.height],
                            children,
                        };
                    });
                }

                // Clean up page state, preventing hovers on deleted shapes

                const nextPageState: TLPageState = {
                    ...next.document.pageStates[pageId],
                };

                if (!nextPageState.brush) {
                    delete nextPageState.brush;
                }

                if (
                    nextPageState.hoveredId &&
                    !page.shapes[nextPageState.hoveredId]
                ) {
                    delete nextPageState.hoveredId;
                }

                if (
                    nextPageState.bindingId &&
                    !page.bindings[nextPageState.bindingId]
                ) {
                    TLDR.warn(`Could not find the binding of ${pageId}`);
                    delete nextPageState.bindingId;
                }

                if (
                    nextPageState.editingId &&
                    !page.shapes[nextPageState.editingId]
                ) {
                    TLDR.warn('Could not find the editing shape!');
                    delete nextPageState.editingId;
                }

                next.document.pageStates[pageId] = nextPageState;
            });
        }

        Object.keys(next.document.assets ?? {}).forEach(id => {
            if (!next.document.assets?.[id]) {
                delete next.document.assets?.[id];
            }
        });

        const currentPageId = next.appState.currentPageId;

        const currentPageState = next.document.pageStates[currentPageId];

        if (next.room && next.room !== prev.room) {
            const room = { ...next.room, users: { ...next.room.users } };

            // Remove any exited users
            if (prev.room) {
                Object.values(prev.room.users)
                    .filter(Boolean)
                    .forEach(user => {
                        if (room.users[user.id] === undefined) {
                            delete room.users[user.id];
                        }
                    });
            }

            next.room = room;
        }

        if (next.room) {
            next.room.users[next.room.userId] = {
                ...next.room.users[next.room.userId],
                point: this.currentPoint,
                selectedIds: currentPageState.selectedIds,
            };
        }

        // Temporary block on editing pages while in readonly mode.
        // This is a broad solution but not a very good one: the UX
        // for interacting with a readOnly document will be more nuanced.
        if (this.readOnly) {
            next.document.pages = prev.document.pages;
        }

        return next;
    };

    override onPatch = (app: TDSnapshot, id?: string) => {
        this.callbacks.onPatch?.(this, id);
    };

    override onCommand = (app: TDSnapshot, id?: string) => {
        this.clear_select_history();
        this.isDirty = true;
        this.callbacks.onCommand?.(this, id);
    };

    override onReplace = () => {
        this.clear_select_history();
        this.isDirty = false;
    };

    override onUndo = () => {
        this.rotationInfo.selectedIds = [...this.selectedIds];
        this.callbacks.onUndo?.(this);
    };

    override onRedo = () => {
        this.rotationInfo.selectedIds = [...this.selectedIds];
        this.callbacks.onRedo?.(this);
    };

    override onPersist = () => {
        // If we are part of a room, send our changes to the server
        if (this.callbacks.onChangePage) {
            this._broadcastPageChanges();
        }
        this.callbacks.onPersist?.(this);
    };

    private prev_selected_ids = this.selectedIds;

    /**
     * Clear the selection history after each new command, undo or redo.
     * @param state
     * @param id
     */
    protected override on_state_did_change = (
        app: TDSnapshot,
        id?: string
    ): void => {
        this.callbacks.onChange?.(this, id);

        if (this.room && this.selectedIds !== this.prev_selected_ids) {
            this.callbacks.onChangePresence?.(this, {
                ...this.room.users[this.room.userId],
                selectedIds: this.selectedIds,
            });
            this.prev_selected_ids = this.selectedIds;
        }
    };

    /* ----------- Managing Multiplayer State ----------- */

    private just_sent = false;
    private prev_shapes = this.page.shapes;
    private prev_bindings = this.page.bindings;
    private prev_assets = this.document.assets;

    private _broadcastPageChanges = () => {
        const visited = new Set<string>();

        const changedShapes: Record<string, TDShape | undefined> = {};
        const changedBindings: Record<string, TDBinding | undefined> = {};
        const changedAssets: Record<string, TDAsset | undefined> = {};

        this.shapes.forEach(shape => {
            visited.add(shape.id);
            if (this.prev_shapes[shape.id] !== shape) {
                changedShapes[shape.id] = shape;
            }
        });

        Object.keys(this.prev_shapes)
            .filter(id => !visited.has(id))
            .forEach(id => {
                // After visiting all the current shapes, if we haven't visited a
                // previously present shape, then it was deleted
                changedShapes[id] = undefined;
            });

        this.bindings.forEach(binding => {
            visited.add(binding.id);
            if (this.prev_bindings[binding.id] !== binding) {
                changedBindings[binding.id] = binding;
            }
        });

        Object.keys(this.prev_bindings)
            .filter(id => !visited.has(id))
            .forEach(id => {
                // After visiting all the current bindings, if we haven't visited a
                // previously present shape, then it was deleted
                changedBindings[id] = undefined;
            });

        this.assets.forEach(asset => {
            visited.add(asset.id);
            if (this.prev_assets[asset.id] !== asset) {
                changedAssets[asset.id] = asset;
            }
        });

        Object.keys(this.prev_assets)
            .filter(id => !visited.has(id))
            .forEach(id => {
                changedAssets[id] = undefined;
            });

        // Only trigger update if shapes or bindings have changed
        if (
            Object.keys(changedBindings).length > 0 ||
            Object.keys(changedShapes).length > 0 ||
            Object.keys(changedAssets).length > 0
        ) {
            this.just_sent = true;
            this.callbacks.onChangePage?.(
                this,
                changedShapes,
                changedBindings,
                changedAssets
            );
            this.prev_shapes = this.page.shapes;
            this.prev_bindings = this.page.bindings;
            this.prev_assets = this.document.assets;
        }
    };

    getReservedContent = (
        coreReservedIds: string[],
        pageId = this.currentPageId
    ) => {
        const { bindings } = this.document.pages[pageId];

        // We want to know which shapes we need to
        const reservedShapes: Record<string, TDShape> = {};
        const reservedBindings: Record<string, TDBinding> = {};

        // Quick lookup maps for bindings
        const bindingsArr = Object.values(bindings);
        const boundTos = new Map(
            bindingsArr.map(binding => [binding.toId, binding])
        );
        const boundFroms = new Map(
            bindingsArr.map(binding => [binding.fromId, binding])
        );
        const bindingMaps = [boundTos, boundFroms];

        // Unique set of shape ids that are going to be reserved
        const reservedShapeIds: string[] = [];

        if (this.session)
            coreReservedIds.forEach(id => reservedShapeIds.push(id));
        if (this.pageState.editingId)
            reservedShapeIds.push(this.pageState.editingId);

        const strongReservedShapeIds = new Set(reservedShapeIds);

        // Which shape ids have we already visited?
        const visited = new Set<string>();

        // Time to visit every reserved shape and every related shape and binding.
        while (reservedShapeIds.length > 0) {
            const id = reservedShapeIds.pop();
            if (!id) break;
            if (visited.has(id)) continue;

            // Add to set so that we don't process this id a second time
            visited.add(id);

            // Get the shape and reserve it
            const shape = this.getShape(id);
            reservedShapes[id] = shape;

            if (shape.parentId !== pageId)
                reservedShapeIds.push(shape.parentId);

            // If the shape has children, add the shape's children to the list of ids to process
            if (shape.children) reservedShapeIds.push(...shape.children);

            // If there are binding for this shape, reserve the bindings and
            // add its related shapes to the list of ids to process
            bindingMaps
                .map(map => map.get(shape.id)!)
                .filter(Boolean)
                .forEach(binding => {
                    reservedBindings[binding.id] = binding;
                    reservedShapeIds.push(binding.toId, binding.fromId);
                });
        }

        return { reservedShapes, reservedBindings, strongReservedShapeIds };
    };

    /**
     * Manually patch in page content.
     */
    public replacePageContent = (
        shapes: Record<string, TDShape>,
        bindings: Record<string, TDBinding>,
        assets: Record<string, TDAsset>,
        pageId = this.currentPageId
    ): this => {
        const page = this.document.pages[this.currentPageId];

        Object.values(shapes).forEach(shape => {
            if (
                shape.parentId !== pageId &&
                !(page.shapes[shape.parentId] || shapes[shape.parentId])
            ) {
                console.warn('Added a shape without a parent on the page');
                shape.parentId = pageId;
            }
        });

        this.useStore.setState(current => {
            const { hoveredId, editingId, bindingId, selectedIds } =
                current.document.pageStates[pageId];

            // Use the incoming shapes / bindings as comparisons for what
            // will have changed. This is important because we want to restore
            // related shapes that may not have changed on our side, but which
            // were deleted on the server.
            this.prev_shapes = shapes;
            this.prev_bindings = bindings;
            this.prev_assets = assets;

            const nextShapes = {
                ...shapes,
            };

            const nextBindings = {
                ...bindings,
            };
            const nextAssets = {
                ...assets,
            };

            const next: TDSnapshot = {
                ...current,
                document: {
                    ...current.document,
                    pages: {
                        [pageId]: {
                            ...current.document.pages[pageId],
                            shapes: nextShapes,
                            bindings: nextBindings,
                        },
                    },
                    assets: nextAssets,
                    pageStates: {
                        ...current.document.pageStates,
                        [pageId]: {
                            ...current.document.pageStates[pageId],
                            selectedIds: selectedIds.filter(
                                id => nextShapes[id] !== undefined
                            ),
                            hoveredId: hoveredId
                                ? nextShapes[hoveredId] === undefined
                                    ? undefined
                                    : hoveredId
                                : undefined,
                            editingId: editingId
                                ? nextShapes[editingId] === undefined
                                    ? undefined
                                    : editingId
                                : undefined,
                            bindingId: bindingId
                                ? nextBindings[bindingId] === undefined
                                    ? undefined
                                    : bindingId
                                : undefined,
                        },
                    },
                },
            };
            const page = next.document.pages[pageId];

            // Get bindings related to the changed shapes
            const bindingsToUpdate = TLDR.get_related_bindings(
                next,
                Object.keys(nextShapes),
                pageId
            );

            const visitedShapes = new Set<ArrowShape>();

            // Update all of the bindings we've just collected
            bindingsToUpdate.forEach(binding => {
                if (!page.bindings[binding.id]) {
                    return;
                }

                const fromShape = page.shapes[binding.fromId] as ArrowShape;

                if (visitedShapes.has(fromShape)) {
                    return;
                }

                // We only need to update the binding's "from" shape (an arrow)
                const fromDelta = TLDR.update_arrow_bindings(page, fromShape);
                visitedShapes.add(fromShape);

                if (fromDelta) {
                    const nextShape = {
                        ...fromShape,
                        ...fromDelta,
                    } as TDShape;

                    page.shapes[fromShape.id] = nextShape;
                }
            });

            Object.values(nextShapes).forEach(shape => {
                if (shape.type !== TDShapeType.Group) return;

                const children = shape.children.filter(
                    id => page.shapes[id] !== undefined
                );

                const commonBounds = Utils.getCommonBounds(
                    children
                        .map(id => page.shapes[id])
                        .filter(Boolean)
                        .map(shape => TLDR.get_rotated_bounds(shape))
                );

                page.shapes[shape.id] = {
                    ...shape,
                    point: [commonBounds.minX, commonBounds.minY],
                    size: [commonBounds.width, commonBounds.height],
                    children,
                };
            });

            this.state.document = next.document;

            return next;
        }, true);

        return this;
    };

    /**
     * Set the current status.
     * @param status The new status to set.
     * @private
     * @returns
     */
    setStatus(status: string) {
        return this.patchState(
            {
                appState: { status },
            },
            `set_status:${status}`
        );
    }

    /**
     * Update the bounding box when the renderer's bounds change.
     * @param bounds
     */
    updateBounds = (bounds: TLBounds) => {
        this.rendererBounds = bounds;
        const { point, zoom } = this.camera;
        this.updateViewport(point, zoom);

        if (!this.readOnly && this.session) {
            this.session.update();
        }
    };

    updateViewport = (point: number[], zoom: number) => {
        const { width, height } = this.rendererBounds;
        const [minX, minY] = Vec.sub(Vec.div([0, 0], zoom), point);
        const [maxX, maxY] = Vec.sub(Vec.div([width, height], zoom), point);

        this.viewport = {
            minX,
            minY,
            maxX,
            maxY,
            height: maxX - minX,
            width: maxY - minY,
        };
    };

    /**
     * Set or clear the editing id
     * @param id [string]
     */
    setEditingId = (id?: string) => {
        if (this.readOnly) return;

        this.editingStartTime = performance.now();
        this.patchState(
            {
                document: {
                    pageStates: {
                        [this.currentPageId]: {
                            editingId: id,
                        },
                    },
                },
            },
            `set_editing_id`
        );
    };

    /**
     * used for EditorUtil only
     * @param id
     * @returns
     */
    setEditingText = (id: string) => {
        if (this.readOnly) return;

        this.patchState(
            {
                document: {
                    pageStates: {
                        [this.currentPageId]: {
                            selectedIds: [id],
                            editingId: id,
                        },
                    },
                },
            },
            `set_editing_id`
        );
    };

    /**
     * Set or clear the hovered id
     * @param id [string]
     */
    setHoveredId = (id?: string) => {
        this.patchState(
            {
                document: {
                    pageStates: {
                        [this.currentPageId]: {
                            hoveredId: id,
                        },
                    },
                },
            },
            `set_hovered_id`
        );
    };

    /* -------------------------------------------------- */
    /*                    Settings & UI                   */
    /* -------------------------------------------------- */

    /**
     * Set a setting.
     */
    setSetting = <
        T extends keyof TDSnapshot['settings'],
        V extends TDSnapshot['settings'][T]
    >(
        name: T,
        value: V | ((value: V) => V)
    ): this => {
        if (this.session) return this;

        this.patchState(
            {
                settings: {
                    [name]:
                        typeof value === 'function'
                            ? value(this.settings[name] as V)
                            : value,
                },
            },
            `settings:${name}`
        );
        this.persist();
        return this;
    };

    /**
     * Toggle pen mode.
     */
    toggleFocusMode = (): this => {
        if (this.session) return this;
        this.patchState(
            {
                settings: {
                    isFocusMode: !this.settings.isFocusMode,
                },
            },
            `settings:toggled_focus_mode`
        );
        this.persist();
        return this;
    };

    /**
     * Toggle pen mode.
     */
    togglePenMode = (): this => {
        if (this.session) return this;
        this.patchState(
            {
                settings: {
                    isPenMode: !this.settings.isPenMode,
                },
            },
            `settings:toggled_pen_mode`
        );
        this.persist();
        return this;
    };

    /**
     * Toggle dark mode.
     */
    toggleDarkMode = (): this => {
        if (this.session) return this;
        this.patchState(
            { settings: { isDarkMode: !this.settings.isDarkMode } },
            `settings:toggled_dark_mode`
        );
        this.persist();
        return this;
    };

    /**
     * Toggle zoom snap.
     */
    toggleZoomSnap = () => {
        if (this.session) return this;
        this.patchState(
            { settings: { isZoomSnap: !this.settings.isZoomSnap } },
            `settings:toggled_zoom_snap`
        );
        this.persist();
        return this;
    };

    /**
     * Toggle debug mode.
     */
    toggleDebugMode = () => {
        if (this.session) return this;
        this.patchState(
            { settings: { isDebugMode: !this.settings.isDebugMode } },
            `settings:toggled_debug`
        );
        this.persist();
        return this;
    };

    /**
     * Toggles the state if menu is opened
     */
    setMenuOpen = (isOpen: boolean): this => {
        this.patchState(
            { appState: { isMenuOpen: isOpen } },
            'ui:toggled_menu_opened'
        );
        this.persist();
        return this;
    };

    /**
     * Toggles the state if something is loading
     */
    setIsLoading = (isLoading: boolean): this => {
        this.patchState({ appState: { isLoading } }, 'ui:toggled_is_loading');
        this.persist();
        return this;
    };

    setDisableAssets = (disableAssets: boolean): this => {
        this.patchState(
            { appState: { disableAssets } },
            'ui:toggled_disable_images'
        );
        return this;
    };

    get isMenuOpen(): boolean {
        return this.appState.isMenuOpen;
    }

    get isLoading(): boolean {
        return this.appState.isLoading;
    }

    get disableAssets(): boolean {
        return this.appState.disableAssets;
    }

    /**
     * Toggle grids.
     */
    toggleGrid = (): this => {
        if (this.session) return this;
        this.patchState(
            { settings: { showGrid: !this.settings.showGrid } },
            'settings:toggled_grid'
        );
        this.persist();
        return this;
    };

    /**
     * Select a tool.
     * @param tool The tool to select, or "select".
     */
    selectTool = (type: TDToolType): this => {
        if (this.readOnly || this.session) return this;

        this.isPointing = false; // reset pointer state, in case something weird happened

        const tool = this.tools[type];

        if (tool === this.currentTool) {
            this.patchState({
                appState: {
                    isToolLocked: false,
                },
            });
            return this;
        }

        this.currentTool.onExit();
        tool.previous = this.currentTool.type;
        this.currentTool = tool;
        this.currentTool.onEnter();

        return this.patchState(
            {
                appState: {
                    activeTool: type,
                    isToolLocked: false,
                },
            },
            `selected_tool:${type}`
        );
    };

    /**
     * Toggle the tool lock option.
     */
    toggleToolLock = (): this => {
        if (this.session) return this;
        return this.patchState(
            {
                appState: {
                    isToolLocked: !this.appState.isToolLocked,
                },
            },
            `toggled_tool_lock`
        );
    };

    /* -------------------------------------------------- */
    /*                      Document                      */
    /* -------------------------------------------------- */

    /**
     * Reset the document to a blank state.
     */
    resetDocument = (): this => {
        if (this.session) return this;
        this.session = undefined;
        this.pasteInfo.offset = [0, 0];
        this.currentTool = this.tools['select'];

        this.resetHistory()
            .clear_select_history()
            .loadDocument(
                migrate(TldrawApp.default_document, TldrawApp.version)
            )
            .persist();

        return this;
    };

    /**
     *
     * @param document
     */
    updateUsers = (users: TDUser[], isOwnUpdate = false): void => {
        this.patchState(
            {
                room: {
                    users: Object.fromEntries(
                        users.map(user => [user.id, user])
                    ),
                },
            },
            isOwnUpdate ? 'room:self:update' : 'room:user:update'
        );
    };

    removeUser = (userId: string) => {
        this.patchState({
            room: {
                users: {
                    [userId]: undefined,
                },
            },
        });
    };

    /**
     * Merge a new document patch into the current document.
     * @param document
     */
    mergeDocument = (document: TDDocument): this => {
        // If it's a new document, do a full change.
        if (this.document.id !== document.id) {
            this.replace_state({
                ...this.state,
                appState: {
                    ...this.appState,
                    currentPageId: Object.keys(document.pages)[0],
                },
                document: migrate(document, TldrawApp.version),
            });
            return this;
        }

        // Have we deleted any pages? If so, drop everything and change
        // to the first page. This is an edge case.
        const currentPageStates = { ...this.document.pageStates };

        // Update the app state's current page id if needed
        const nextAppState = {
            ...this.appState,
            currentPageId: document.pages[this.currentPageId]
                ? this.currentPageId
                : Object.keys(document.pages)[0],
            pages: Object.values(document.pages).map((page, i) => ({
                id: page.id,
                name: page.name,
                childIndex: page.childIndex || i,
            })),
        };

        // Reset the history (for now)
        this.resetHistory();

        Object.keys(this.document.pages).forEach(pageId => {
            if (!document.pages[pageId]) {
                if (pageId === this.appState.currentPageId) {
                    this.cancelSession();
                    this.selectNone();
                }

                currentPageStates[pageId] = undefined as unknown as TLPageState;
            }
        });

        // Don't allow the selected ids to be deleted during a session—if
        // they've been removed, put them back in the client's document.
        if (this.session) {
            this.selectedIds
                .filter(id => !document.pages[this.currentPageId].shapes[id])
                .forEach(
                    id =>
                        (document.pages[this.currentPageId].shapes[id] =
                            this.page.shapes[id])
                );
        }

        // For other pages, remove any selected ids that were deleted.
        Object.entries(currentPageStates).forEach(([pageId, pageState]) => {
            pageState.selectedIds = pageState.selectedIds.filter(
                id => !!document.pages[pageId].shapes[id]
            );
        });

        // If the user is currently creating a shape (ie drawing), then put that
        // shape back onto the page for the client.
        const { editingId } = this.pageState;

        if (editingId) {
            document.pages[this.currentPageId].shapes[editingId] =
                this.page.shapes[editingId];
            currentPageStates[this.currentPageId].selectedIds = [editingId];
        }

        return this.replace_state(
            {
                ...this.state,
                appState: nextAppState,
                document: {
                    ...migrate(document, TldrawApp.version),
                    pageStates: currentPageStates,
                },
            },
            'merge'
        );
    };

    /**
     * Update the current document.
     * @param document
     */
    updateDocument = (
        document: TDDocument,
        reason = 'updated_document'
    ): this => {
        const prevState = this.state;

        const nextState = { ...prevState, document: { ...prevState.document } };

        if (!document.pages[this.currentPageId]) {
            nextState.appState = {
                ...prevState.appState,
                currentPageId: Object.keys(document.pages)[0],
            };
        }

        let i = 1;

        for (const nextPage of Object.values(document.pages)) {
            if (nextPage !== prevState.document.pages[nextPage.id]) {
                nextState.document.pages[nextPage.id] = nextPage;

                if (!nextPage.name) {
                    nextState.document.pages[nextPage.id].name = `Page ${
                        i + 1
                    }`;
                    i++;
                }
            }
        }

        for (const nextPageState of Object.values(document.pageStates)) {
            if (
                nextPageState !==
                prevState.document.pageStates[nextPageState.id]
            ) {
                nextState.document.pageStates[nextPageState.id] = nextPageState;

                const nextPage = document.pages[nextPageState.id];
                const keysToCheck = [
                    'bindingId',
                    'editingId',
                    'hoveredId',
                    'pointedId',
                ] as const;

                for (const key of keysToCheck) {
                    if (!nextPage.shapes[key]) {
                        nextPageState[key] = undefined;
                    }
                }

                nextPageState.selectedIds = nextPageState.selectedIds.filter(
                    id => !!document.pages[nextPage.id].shapes[id]
                );
            }
        }

        nextState.document = migrate(
            nextState.document,
            nextState.document.version || 0
        );

        return this.replace_state(nextState, `${reason}:${document.id}`);
    };

    /**
     * Load a fresh room into the state.
     * @param roomId
     */
    loadRoom = (roomId: string): this => {
        this.patchState({
            room: {
                id: roomId,
                userId: uuid,
                users: {
                    [uuid]: {
                        id: uuid,
                        color: USER_COLORS[
                            Math.floor(Math.random() * USER_COLORS.length)
                        ],
                        point: [100, 100],
                        selectedIds: [],
                        activeShapes: [],
                    },
                },
            },
        });
        return this;
    };

    /**
     * Load a new document.
     * @param document The document to load
     */
    loadDocument = (document: TDDocument): this => {
        this.selectNone();
        this.resetHistory();
        this.clear_select_history();
        this.session = undefined;

        this.replace_state(
            {
                ...TldrawApp.defaultState,
                settings: {
                    ...this.state.settings,
                },
                document: migrate(document, TldrawApp.version),
                appState: {
                    ...TldrawApp.defaultState.appState,
                    ...this.state.appState,
                    currentPageId: Object.keys(document.pages)[0],
                    disableAssets: this.disableAssets,
                },
            },
            'loaded_document'
        );
        const { point, zoom } = this.camera;
        this.updateViewport(point, zoom);
        return this;
    };

    // Should we move this to the app layer? onSave, onSaveAs, etc?

    /**
     * Create a new project.
     */
    newProject = () => {
        if (!this.isLocal) return;
        this.fileSystemHandle = null;
        this.resetDocument();
    };

    /**
     * Save the current project.
     */
    saveProject = async () => {
        if (this.readOnly) return;
        try {
            const fileHandle = await saveToFileSystem(
                migrate(this.document, TldrawApp.version),
                this.fileSystemHandle
            );
            this.fileSystemHandle = fileHandle;
            this.persist();
            this.isDirty = false;
        } catch (e: any) {
            // Likely cancelled
            console.error(e.message);
        }
        return this;
    };

    /**
     * Save the current project as a new file.
     */
    saveProjectAs = async () => {
        try {
            const fileHandle = await saveToFileSystem(this.document, null);
            this.fileSystemHandle = fileHandle;
            this.persist();
            this.isDirty = false;
        } catch (e: any) {
            // Likely cancelled
            console.error(e.message);
        }
        return this;
    };

    /**
     * Load a project from the filesystem.
     * @todo
     */
    openProject = async () => {
        if (!this.isLocal) return;

        try {
            const result = await openFromFileSystem();
            if (!result) {
                throw Error();
            }

            const { fileHandle, document } = result;
            this.loadDocument(document);
            this.fileSystemHandle = fileHandle;
            this.zoomToFit();
            this.persist();
        } catch (e) {
            console.error(e);
        } finally {
            this.persist();
        }
    };

    /**
     * Upload media from file
     */
    openAsset = async () => {
        if (!this.disableAssets)
            try {
                const file = await openAssetFromFileSystem();
                if (!file) return;
                this.addMediaFromFile(file);
            } catch (e) {
                console.error(e);
            } finally {
                this.persist();
            }
    };

    /**
     * Sign out of the current account.
     * Should move to the www layer.
     * @todo
     */
    signOut = () => {
        // TODO:
    };
    /* -------------------- Getters --------------------- */

    /**
     * Get the current app state.
     */
    getAppState = (): TDSnapshot['appState'] => {
        return this.appState;
    };

    /**
     * Get a page.
     * @param pageId (optional) The page's id.
     */
    getPage = (pageId = this.currentPageId): TDPage => {
        return TLDR.get_page(this.state, pageId || this.currentPageId);
    };

    /**
     * Get the shapes (as an array) from a given page.
     * @param pageId (optional) The page's id.
     */
    getShapes = (pageId = this.currentPageId): TDShape[] => {
        return TLDR.get_shapes(this.state, pageId || this.currentPageId);
    };

    /**
     * Get the bindings from a given page.
     * @param pageId (optional) The page's id.
     */
    getBindings = (pageId = this.currentPageId): TDBinding[] => {
        return TLDR.get_bindings(this.state, pageId || this.currentPageId);
    };

    /**
     * Get a shape from a given page.
     * @param id The shape's id.
     * @param pageId (optional) The page's id.
     */
    getShape = <T extends TDShape = TDShape>(
        id: string,
        pageId = this.currentPageId
    ): T => {
        return TLDR.get_shape<T>(this.state, id, pageId);
    };

    /**
     * Get the bounds of a shape on a given page.
     * @param id The shape's id.
     * @param pageId (optional) The page's id.
     */
    getShapeBounds = (id: string, pageId = this.currentPageId): TLBounds => {
        return TLDR.get_bounds(this.getShape(id, pageId));
    };

    /**
     * Get a binding from a given page.
     * @param id The binding's id.
     * @param pageId (optional) The page's id.
     */
    getBinding = (id: string, pageId = this.currentPageId): TDBinding => {
        return TLDR.get_binding(this.state, id, pageId);
    };

    /**
     * Get the page state for a given page.
     * @param pageId (optional) The page's id.
     */
    getPageState = (pageId = this.currentPageId): TLPageState => {
        return TLDR.get_page_state(this.state, pageId || this.currentPageId);
    };

    /**
     * Turn a screen point into a point on the page.
     * @param point The screen point
     * @param pageId (optional) The page to use
     */
    getPagePoint = (point: number[], pageId = this.currentPageId): number[] => {
        const { camera } = this.getPageState(pageId);
        return Vec.sub(Vec.div(point, camera.zoom), camera.point);
    };

    /**
     * Turn a page point into a point on the screen.
     * @param pagePoint The page point
     * @param pageId (optional) The page to use
     */
    getScreenPoint = (
        pagePoint: number[],
        pageId = this.currentPageId
    ): number[] => {
        const { camera } = this.getPageState(pageId);
        return Vec.mul(Vec.add(pagePoint, camera.point), camera.zoom);
    };

    /**
     * Get the current undo/redo stack.
     */
    get history() {
        return this.stack.slice(0, this.pointer + 1);
    }

    /**
     * Replace the current history stack.
     */
    set history(commands: TldrawCommand[]) {
        this.replaceHistory(commands);
    }

    /**
     * The current document.
     */
    get document(): TDDocument {
        return this.state.document;
    }

    /**
     * The current app state.
     */
    get settings(): TDSnapshot['settings'] {
        return this.state.settings;
    }

    /**
     * The current app state.
     */
    get appState(): TDSnapshot['appState'] {
        return this.state.appState;
    }

    /**
     * The current page id.
     */
    get currentPageId(): string {
        return this.state.appState.currentPageId;
    }

    /**
     * The current page.
     */
    get page(): TDPage {
        return this.state.document.pages[this.currentPageId];
    }

    /**
     * The current page's shapes (as an array).
     */
    get shapes(): TDShape[] {
        return Object.values(this.page.shapes);
    }

    /**
     * The current page's bindings.
     */
    get bindings(): TDBinding[] {
        return Object.values(this.page.bindings);
    }

    /**
     * The document's assets (as an array).
     */
    get assets(): TDAsset[] {
        return Object.values(this.document.assets);
    }

    /**
     * The current page's state.
     */
    get pageState(): TLPageState {
        return this.state.document.pageStates[this.currentPageId];
    }

    get camera(): {
        point: number[];
        zoom: number;
    } {
        return this.pageState.camera;
    }

    get zoom(): number {
        return this.pageState.camera.zoom;
    }

    /**
     * The page's current selected ids.
     */
    get selectedIds(): string[] {
        return this.pageState.selectedIds;
    }

    /* -------------------------------------------------- */
    /*                        Pages                       */
    /* -------------------------------------------------- */

    /**
     * Create a new page.
     * @param pageId (optional) The new page's id.
     */
    createPage = (id?: string): this => {
        if (this.readOnly) return this;
        const { width, height } = this.rendererBounds;
        return this.set_state(
            this.commands.createPage(this, [-width / 2, -height / 2], id)
        );
    };

    /**
     * Change the current page.
     * @param pageId The new current page's id.
     */
    changePage = (pageId: string): this => {
        return this.set_state(this.commands.changePage(this, pageId));
    };

    /**
     * Rename a page.
     * @param pageId The id of the page to rename.
     * @param name The page's new name
     */
    renamePage = (pageId: string, name: string): this => {
        if (this.readOnly) return this;
        return this.set_state(this.commands.renamePage(this, pageId, name));
    };

    /**
     * Duplicate a page.
     * @param pageId The id of the page to duplicate.
     */
    duplicatePage = (pageId: string): this => {
        if (this.readOnly) return this;
        return this.set_state(this.commands.duplicatePage(this, pageId));
    };

    /**
     * Delete a page.
     * @param pageId The id of the page to delete.
     */
    deletePage = (pageId?: string): this => {
        if (this.readOnly) return this;
        if (Object.values(this.document.pages).length <= 1) return this;
        return this.set_state(
            this.commands.deletePage(this, pageId ? pageId : this.currentPageId)
        );
    };

    /* -------------------------------------------------- */
    /*                      Clipboard                     */
    /* -------------------------------------------------- */

    private get_clipboard(
        ids = this.selectedIds,
        pageId = this.currentPageId
    ):
        | {
              shapes: TDShape[];
              bindings: TDBinding[];
              assets: TDAsset[];
          }
        | undefined {
        const copyingShapeIds = ids.flatMap(id =>
            TLDR.get_document_branch(this.state, id, this.currentPageId)
        );

        const copyingShapes = copyingShapeIds.map(id =>
            Utils.deepClone(this.getShape(id, this.currentPageId))
        );

        if (copyingShapes.length === 0) return;

        const copyingBindings: TDBinding[] = Object.values(
            this.page.bindings
        ).filter(
            binding =>
                copyingShapeIds.includes(binding.fromId) &&
                copyingShapeIds.includes(binding.toId)
        );

        const copyingAssets = copyingShapes
            .map(shape => {
                if (!shape.assetId) return;

                return this.document.assets[shape.assetId];
            })
            .filter(Boolean) as TDAsset[];

        return {
            shapes: copyingShapes,
            bindings: copyingBindings,
            assets: copyingAssets,
        };
    }

    /**
     * Cut (copy and delete) one or more shapes to the clipboard.
     * @param ids The ids of the shapes to cut.
     */
    cut = (
        ids = this.selectedIds,
        pageId = this.currentPageId,
        e?: ClipboardEvent
    ): this => {
        e?.preventDefault();

        this.copy(ids, pageId, e);
        if (!this.readOnly) {
            this.delete(ids);
        }
        return this;
    };

    /**
     * Copy one or more shapes to the clipboard.
     * @param ids The ids of the shapes to copy.
     * @param pageId
     * @param e
     */
    copy = async (
        ids = this.selectedIds,
        pageId = this.currentPageId,
        e?: ClipboardEvent
    ) => {
        e?.preventDefault();

        this.clipboard = this.get_clipboard(ids, pageId);

        const jsonString = JSON.stringify({
            type: 'tldr/clipboard',
            ...this.clipboard,
        });

        const tldrawString = `<tldraw>${jsonString}</tldraw>`;

        setClipboard(tldrawString);

        if (e) {
            e.clipboardData?.setData('text/html', tldrawString);
            await this.callbacks.onCopy?.(e, this.selectedIds);
        }

        /**
         * Reasons for not using Clipboard API for now:
         * 1. The `clipboardData.setData` method temporarily satisfies the need for replication functionality
         * 2. Clipboard API requires the user to agree to access(https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API)
         *
         * **/
        // if (navigator.clipboard && window.ClipboardItem) {
        //     navigator.clipboard.write([
        //         new ClipboardItem({
        //             'text/html': new Blob([tldrawString], {
        //                 type: 'text/html',
        //             }),
        //         }),
        //     ]);
        // }

        this.pasteInfo.offset = [0, 0];
        this.pasteInfo.center = [0, 0];

        return this;
    };

    /**
     * Paste shapes (or text) from clipboard to a certain point.
     * @param point
     */
    paste = async (point?: number[], e?: ClipboardEvent) => {
        if (this.readOnly) return;

        const pasteInCurrentPage = (
            shapes: TDShape[],
            bindings: TDBinding[],
            assets: TDAsset[]
        ) => {
            const idsMap: Record<string, string> = {};

            const newAssets = assets.filter(
                asset => this.document.assets[asset.id] === undefined
            );

            if (newAssets.length) {
                this.patchState({
                    document: {
                        assets: Object.fromEntries(
                            newAssets.map(asset => [asset.id, asset])
                        ),
                    },
                });
            }

            shapes.forEach(shape => (idsMap[shape.id] = Utils.uniqueId()));

            bindings.forEach(
                binding => (idsMap[binding.id] = Utils.uniqueId())
            );

            let startIndex = TLDR.get_top_child_index(
                this.state,
                this.currentPageId
            );

            const shapesToPaste = shapes
                .sort((a, b) => a.childIndex - b.childIndex)
                .map(shape => {
                    const parentShapeId = idsMap[shape.parentId];

                    const copy = {
                        ...shape,
                        id: idsMap[shape.id],
                        parentId: parentShapeId || this.currentPageId,
                    };

                    if (shape.children) {
                        copy.children = shape.children.map(id => idsMap[id]);
                    }

                    if (!parentShapeId) {
                        copy.childIndex = startIndex;
                        startIndex++;
                    }

                    if (copy.handles) {
                        Object.values(copy.handles).forEach(handle => {
                            if (handle.bindingId) {
                                handle.bindingId = idsMap[handle.bindingId];
                            }
                        });
                    }

                    return copy;
                });

            const bindingsToPaste = bindings.map(binding => ({
                ...binding,
                id: idsMap[binding.id],
                toId: idsMap[binding.toId],
                fromId: idsMap[binding.fromId],
            }));

            const commonBounds = Utils.getCommonBounds(
                shapesToPaste.map(TLDR.get_bounds)
            );

            let center = Vec.toFixed(
                this.getPagePoint(point || this.centerPoint)
            );

            if (
                Vec.dist(center, this.pasteInfo.center) < 2 ||
                Vec.dist(
                    center,
                    Vec.toFixed(Utils.getBoundsCenter(commonBounds))
                ) < 2
            ) {
                center = Vec.add(center, this.pasteInfo.offset);
                this.pasteInfo.offset = Vec.add(this.pasteInfo.offset, [
                    GRID_SIZE,
                    GRID_SIZE,
                ]);
            } else {
                this.pasteInfo.center = center;
                this.pasteInfo.offset = [0, 0];
            }

            const centeredBounds = Utils.centerBounds(commonBounds, center);

            const delta = Vec.sub(
                Utils.getBoundsCenter(centeredBounds),
                Utils.getBoundsCenter(commonBounds)
            );

            this.create(
                shapesToPaste.map(shape =>
                    TLDR.get_shape_util(shape.type).create({
                        ...shape,
                        point: Vec.toFixed(Vec.add(shape.point, delta)),
                        parentId: shape.parentId || this.currentPageId,
                    })
                ),
                bindingsToPaste
            );
        };

        const pasteTextAsSvg = async (text: string) => {
            const div = document.createElement('div');
            div.innerHTML = text;
            const svg = div.firstChild as SVGSVGElement;

            svg.style.setProperty('background-color', 'transparent');

            const imageBlob = await TLDR.get_image_for_svg(
                svg,
                TDExportType.SVG,
                {
                    scale: 1,
                    quality: 1,
                }
            );

            if (imageBlob) {
                const file = new File([imageBlob], 'image.svg');
                this.addMediaFromFile(file);
            } else {
                pasteTextAsShape(text);
            }
        };

        const pasteTextAsShape = (text: string) => {
            // const shapeId = Utils.uniqueId();
            // this.createShapes({
            //     id: shapeId,
            //     type: TDShapeType.Text,
            //     parentId: this.appState.currentPageId,
            //     text: TLDR.normalize_text(text.trim()),
            //     point: this.getPagePoint(this.centerPoint, this.currentPageId),
            //     style: { ...this.appState.currentStyle }
            // });
            // this.select(shapeId);
        };

        const paste_as_html = (html: string) => {
            try {
                const maybeJson = html.match(/<tldraw>(.*)<\/tldraw>/)?.[1];

                if (!maybeJson) return;

                const json: {
                    type: string;
                    shapes: TDShape[];
                    bindings: TDBinding[];
                    assets: TDAsset[];
                } = JSON.parse(maybeJson);

                if (json.type === 'tldr/clipboard') {
                    pasteInCurrentPage(json.shapes, json.bindings, json.assets);
                    return;
                } else {
                    throw Error('Not tldraw data!');
                }
            } catch (e) {
                pasteTextAsShape(html);
                return;
            }
        };

        if (e !== undefined) {
            const items: DataTransferItemList =
                e.clipboardData?.items ?? ({} as DataTransferItemList);
            for (const index in items) {
                const item = items[index];

                // TODO:
                // We could eventually support pasting multiple files / images,
                // and tiling them out on the canvas. At the moment, let's just
                // support pasting one file / image.

                if (item.type === 'text/html') {
                    item.getAsString(async (text: string) => {
                        paste_as_html(text);
                    });
                    return;
                } else {
                    switch (item.kind) {
                        case 'string': {
                            item.getAsString(async (text: string) => {
                                if (text.startsWith('<svg')) {
                                    pasteTextAsSvg(text);
                                } else {
                                    pasteTextAsShape(text);
                                }
                            });
                            return;
                        }
                        case 'file': {
                            const file = item.getAsFile();
                            if (file) {
                                this.addMediaFromFile(file);
                                return;
                            }
                        }
                    }
                }
            }
        }

        getClipboard().then(clipboard => {
            if (clipboard) {
                paste_as_html(clipboard);
            }
        });

        if (navigator.clipboard) {
            const items = await navigator.clipboard.read();

            if (items.length === 0) return;

            try {
                for (const item of items) {
                    // look for png data.

                    const pngData = await item.getType('text/png');

                    if (pngData) {
                        const file = new File([pngData], 'image.png');
                        this.addMediaFromFile(file);
                        return;
                    }

                    // look for svg data.

                    const svgData = await item.getType('image/svg+xml');

                    if (svgData) {
                        const file = new File([svgData], 'image.svg');
                        this.addMediaFromFile(file);
                        return;
                    }

                    // look for plain text data.

                    const textData = await item.getType('text/plain');

                    if (textData) {
                        // TODO: Paste as an SVG image if the incoming data is an SVG.
                        const text = await textData.text();
                        text.trim();

                        if (text.startsWith('<svg')) {
                            pasteTextAsSvg(text);
                        } else {
                            pasteTextAsShape(text);
                        }

                        return;
                    }
                }
            } catch (e) {
                // noop
            }
        } else {
            TLDR.warn('This browser does not support the Clipboard API!');
            if (this.clipboard) {
                pasteInCurrentPage(
                    this.clipboard.shapes,
                    this.clipboard.bindings,
                    this.clipboard.assets
                );
            }
        }

        return this;
    };

    getSvg = async (
        ids = this.selectedIds.length
            ? this.selectedIds
            : Object.keys(this.page.shapes),
        opts = {} as Partial<{
            transparentBackground: boolean;
            includeFonts: boolean;
        }>
    ): Promise<SVGElement | undefined> => {
        if (ids.length === 0) return;

        // Embed our custom fonts
        const svg = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'svg'
        );
        const defs = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'defs'
        );
        const style = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'style'
        );

        window.focus(); // weird but necessary

        if (opts.includeFonts) {
            try {
                const { fonts } = await fetch(TldrawApp.asset_src, {
                    mode: 'no-cors',
                }).then(d => d.json());

                style.textContent = `
          @font-face {
            font-family: 'Caveat Brush';
            src: url(data:application/x-font-woff;charset=utf-8;base64,${fonts.caveat}) format('woff');
            font-weight: 500;
            font-style: normal;
          }

          @font-face {
            font-family: 'Source Code Pro';
            src: url(data:application/x-font-woff;charset=utf-8;base64,${fonts.source_code_pro}) format('woff');
            font-weight: 500;
            font-style: normal;
          }

          @font-face {
            font-family: 'Source Sans Pro';
            src: url(data:application/x-font-woff;charset=utf-8;base64,${fonts.source_sans_pro}) format('woff');
            font-weight: 500;
            font-style: normal;
          }

          @font-face {
            font-family: 'Crimson Pro';
            src: url(data:application/x-font-woff;charset=utf-8;base64,${fonts.crimson_pro}) format('woff');
            font-weight: 500;
            font-style: normal;
          }
          `;
            } catch (e) {
                TLDR.warn('Could not find tldraw-assets.json file.');
            }
        } else {
            style.textContent = `@import url('https://fonts.googleapis.com/css2?family=Caveat+Brush&family=Source+Code+Pro&family=Source+Sans+Pro&family=Crimson+Pro&display=block');`;
        }

        defs.append(style);
        svg.append(defs);

        // Get the shapes in order
        const shapes = ids
            .map(id => this.getShape(id, this.currentPageId))
            .sort((a, b) => a.childIndex - b.childIndex);

        // Find their common bounding box. Shapes will be positioned relative to this box
        const commonBounds = Utils.getCommonBounds(
            shapes.map(TLDR.get_rotated_bounds)
        );

        // A quick routine to get an SVG element for each shape
        const getSvgElementForShape = (shape: TDShape) => {
            const util = TLDR.get_shape_util(shape);
            const bounds = util.getBounds(shape);
            const elm = util.getSvgElement(shape, this.settings.isDarkMode);

            if (!elm) return;

            // If the element is an image, set the asset src as the xlinkhref
            if (shape.type === TDShapeType.Image) {
                elm.setAttribute(
                    'xlink:href',
                    this.document.assets[shape.assetId].src
                );
            } else if (shape.type === TDShapeType.Video) {
                elm.setAttribute('xlink:href', this.serializeVideo(shape.id));
            }

            // Put the element in the correct position relative to the common bounds
            elm.setAttribute(
                'transform',
                `translate(${(
                    SVG_EXPORT_PADDING +
                    shape.point[0] -
                    commonBounds.minX
                ).toFixed(2)}, ${(
                    SVG_EXPORT_PADDING +
                    shape.point[1] -
                    commonBounds.minY
                ).toFixed(2)}) rotate(${(
                    ((shape.rotation || 0) * 180) /
                    Math.PI
                ).toFixed(2)}, ${(bounds.width / 2).toFixed(2)}, ${(
                    bounds.height / 2
                ).toFixed(2)})`
            );

            return elm;
        };

        // Assemble the final SVG by iterating through each shape and its children
        shapes.forEach(shape => {
            // The shape is a group! Just add the children.
            if (shape.children?.length) {
                // Create a group <g> elm for shape
                const g = document.createElementNS(
                    'http://www.w3.org/2000/svg',
                    'g'
                );

                // Get the shape's children as elms and add them to the group
                shape.children.forEach(childId => {
                    const shape = this.getShape(childId, this.currentPageId);
                    const elm = getSvgElementForShape(shape);

                    if (elm) {
                        g.append(elm);
                    }
                });

                // Add the group elm to the SVG
                svg.append(g);

                return;
            }

            // Just add the shape's element to the
            const elm = getSvgElementForShape(shape);

            if (elm) {
                svg.append(elm);
            }
        });

        // Resize the elm to the bounding box
        svg.setAttribute(
            'viewBox',
            [
                0,
                0,
                commonBounds.width + SVG_EXPORT_PADDING * 2,
                commonBounds.height + SVG_EXPORT_PADDING * 2,
            ].join(' ')
        );

        // Clean up the SVG by removing any hidden elements
        svg.setAttribute('width', commonBounds.width.toString());
        svg.setAttribute('height', commonBounds.height.toString());

        if (opts.transparentBackground) {
            svg.style.setProperty('background-color', 'transparent');
        } else {
            svg.style.setProperty(
                'background-color',
                this.settings.isDarkMode ? '#212529' : 'rgb(248, 249, 250)'
            );
        }

        svg.querySelectorAll(
            '.tl-fill-hitarea, .tl-stroke-hitarea, .tl-binding-indicator'
        ).forEach(elm => elm.remove());

        return svg;
    };

    /**
     * Copy one or more shapes as SVG.
     * @param ids The ids of the shapes to copy.
     * @param pageId The page from which to copy the shapes.
     * @returns A string containing the JSON.
     */
    copySvg = async (
        ids = this.selectedIds.length
            ? this.selectedIds
            : Object.keys(this.page.shapes)
    ) => {
        if (ids.length === 0) return;

        const svg = await this.getSvg(ids);

        if (!svg) return;

        const svgString = TLDR.get_svg_string(svg, 1);

        this.clipboard = this.get_clipboard(ids);

        const tldrawString = JSON.stringify({
            type: 'tldr/clipboard',
            ...this.clipboard,
        });

        if (navigator.clipboard && window.ClipboardItem) {
            navigator.clipboard.write([
                new ClipboardItem({
                    'text/html': new Blob([tldrawString], {
                        type: 'text/html',
                    }),
                    'text/plain': new Blob([svgString], { type: 'text/plain' }),
                }),
            ]);
        }

        return svgString;
    };

    /**
     * Copy one or more shapes as JSON.
     * @param ids The ids of the shapes to copy.
     * @param pageId The page from which to copy the shapes.
     * @returns A string containing the JSON.
     */
    copyJson = (ids = this.selectedIds, pageId = this.currentPageId) => {
        if (ids.length === 0) ids = Object.keys(this.page.shapes);

        if (ids.length === 0) return;

        const shapes = ids.map(id => this.getShape(id, pageId));
        const json = JSON.stringify(shapes, null, 2);

        TLDR.copy_string_to_clipboard(json);

        return json;
    };

    /**
     * Export one or more shapes as JSON.
     * @param ids The ids of the shapes to copy from the current page.
     * @returns A string containing the JSON.
     */
    exportJson = (
        ids = this.selectedIds.length
            ? this.selectedIds
            : Object.keys(this.page.shapes)
    ) => {
        if (ids.length === 0) return;

        const shapes = ids.map(id => this.getShape(id, this.currentPageId));
        const json = JSON.stringify(shapes, null, 2);
        const blob = new Blob([json], { type: 'application/json' });

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `export.json`;
        link.click();
    };

    /**
     * Get an image of the selected shapes.
     *
     * @param format The format to export the image as.
     * @param opts (optional) An object containing options for the image.
     * @param opts.ids (optional) The ids of the shapes (on the current page) to get an image for.
     * @param opts.scale (optional) The id of the page from which to get an image.
     * @param opts.quality (optional) The quality (between 0 and 1) for the image if lossy format.
     */
    getImage = async (
        format: Exclude<TDExportType, TDExportType.JSON> = TDExportType.PNG,
        opts = {} as Partial<{
            ids: string[];
            scale: number;
            quality: number;
            transparentBackground: boolean;
        }>
    ): Promise<Blob | undefined> => {
        const {
            ids = this.selectedIds.length
                ? this.selectedIds
                : Object.keys(this.page.shapes),
        } = opts;

        const svg = await this.getSvg(ids, {
            includeFonts: format !== TDExportType.SVG,
            transparentBackground: format === TDExportType.PNG,
        });

        if (!svg) return;

        if (format === TDExportType.SVG) {
            const svgString = TLDR.get_svg_string(svg, 1);
            const blob = new Blob([svgString], { type: 'image/svg+xml' });
            return blob;
        }

        const imageBlob = await TLDR.get_image_for_svg(svg, format, opts);

        if (!imageBlob) return;

        return imageBlob;
    };

    /**
     * Copy an image of the selected shapes.
     *
     * @param format The format to export the image as.
     * @param opts (optional) An object containing options for the image.
     * @param opts.ids (optional) The ids of the shapes (on the current page) to get an image for.
     * @param opts.scale (optional) The id of the page from which to get an image.
     * @param opts.quality (optional) The quality (between 0 and 1) for the image if lossy format.
     */
    copyImage = async (
        format: TDExportType.PNG | TDExportType.SVG = TDExportType.PNG,
        opts = {} as Partial<{
            ids: string[];
            scale: number;
            quality: number;
            transparentBackground: boolean;
        }>
    ) => {
        if (format === TDExportType.SVG) {
            this.copySvg(opts.ids);
            return;
        }

        if (!(navigator.clipboard && window.ClipboardItem)) {
            console.warn(
                'Sorry, your browser does not support copying images.'
            );
            return;
        }

        const blob = await this.getImage(format, opts);

        if (!blob) return;

        navigator.clipboard.write([
            new ClipboardItem({
                [blob.type]: blob,
            }),
        ]);
    };

    exportImage = async (
        format: Exclude<TDExportType, TDExportType.JSON> = TDExportType.PNG,
        opts = {} as Partial<{
            ids: string[];
            pageId: string;
            scale: number;
            quality: number;
            transparentBackground: boolean;
        }>
    ) => {
        const {
            scale = 2,
            quality = 1,
            ids = this.selectedIds,
            pageId = this.currentPageId,
        } = opts;

        const blob = await this.getImage(format, opts);

        if (!blob) return;

        const name = this.document.pages[pageId].name ?? 'export';

        if (this.callbacks.onExport) {
            this.callbacks.onExport(this, {
                name,
                type: format,
                blob,
            });
        } else {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${name}.${format}`;
            link.click();
        }
    };

    /* -------------------------------------------------- */
    /*                       Camera                       */
    /* -------------------------------------------------- */

    /**
     * Set the camera to a specific point and zoom.
     * @param point The camera point (top left of the viewport).
     * @param zoom The zoom level.
     * @param reason Why did the camera change?
     */
    setCamera = (point: number[], zoom: number, reason: string): this => {
        this.updateViewport(point, zoom);
        this.patchState(
            {
                document: {
                    pageStates: {
                        [this.currentPageId]: { camera: { point, zoom } },
                    },
                },
            },
            reason
        );
        return this;
    };

    /**
     * Reset the camera to the default position
     */
    resetCamera = (): this => {
        return this.setCamera(this.centerPoint, 1, `reset_camera`);
    };

    /**
     * Pan the camera
     * @param delta
     */
    pan = (delta: number[]): this => {
        const { camera } = this.pageState;
        return this.setCamera(
            Vec.toFixed(Vec.sub(camera.point, delta)),
            camera.zoom,
            `panned`
        );
    };

    /**
     * Pinch to a new zoom level, possibly together with a pan.
     * @param point The current point under the cursor.
     * @param delta The movement delta.
     * @param zoomDelta The zoom detal
     */
    pinchZoom = (point: number[], delta: number[], zoom: number): this => {
        const { camera } = this.pageState;
        const nextPoint = Vec.sub(camera.point, Vec.div(delta, camera.zoom));
        const nextZoom = zoom;
        const p0 = Vec.sub(Vec.div(point, camera.zoom), nextPoint);
        const p1 = Vec.sub(Vec.div(point, nextZoom), nextPoint);
        return this.setCamera(
            Vec.toFixed(Vec.add(nextPoint, Vec.sub(p1, p0))),
            nextZoom,
            `pinch_zoomed`
        );
    };

    /**
     * Zoom to a new zoom level, keeping the point under the cursor in the same position
     * @param next The new zoom level.
     * @param center The point to zoom towards (defaults to screen center).
     */
    zoomTo = (next: number, center = this.centerPoint): this => {
        const { zoom, point } = this.camera;
        const p0 = Vec.sub(Vec.div(center, zoom), point);
        const p1 = Vec.sub(Vec.div(center, next), point);
        return this.setCamera(
            Vec.toFixed(Vec.add(point, Vec.sub(p1, p0))),
            next,
            `zoomed_camera`
        );
    };

    /**
     * Zoom out by 25%
     */
    zoomIn = (): this => {
        const i = Math.round((this.camera.zoom * 100) / 25);
        const nextZoom = TLDR.get_camera_zoom((i + 1) * 0.25);
        return this.zoomTo(nextZoom);
    };

    /**
     * Zoom in by 25%.
     */
    zoomOut = (): this => {
        const i = Math.round((this.camera.zoom * 100) / 25);
        const nextZoom = TLDR.get_camera_zoom((i - 1) * 0.25);
        return this.zoomTo(nextZoom);
    };

    /**
     * Zoom to fit the page's shapes.
     */
    zoomToFit = (): this => {
        const {
            shapes,
            pageState: { camera },
        } = this;
        if (shapes.length === 0) return this;
        const { rendererBounds } = this;
        const commonBounds = Utils.getCommonBounds(shapes.map(TLDR.get_bounds));
        let zoom = TLDR.get_camera_zoom(
            Math.min(
                (rendererBounds.width - FIT_TO_SCREEN_PADDING) /
                    commonBounds.width,
                (rendererBounds.height - FIT_TO_SCREEN_PADDING) /
                    commonBounds.height
            )
        );
        zoom =
            camera.zoom === zoom || camera.zoom < 1 ? Math.min(1, zoom) : zoom;
        const mx =
            (rendererBounds.width - commonBounds.width * zoom) / 2 / zoom;
        const my =
            (rendererBounds.height - commonBounds.height * zoom) / 2 / zoom;
        return this.setCamera(
            Vec.toFixed(
                Vec.sub([mx, my], [commonBounds.minX, commonBounds.minY])
            ),
            zoom,
            `zoomed_to_fit`
        );
    };

    /**
     * Zoom to the selected shapes.
     */
    zoomToSelection = (): this => {
        if (this.selectedIds.length === 0) return this;

        const { rendererBounds } = this;
        const selectedBounds = TLDR.get_selected_bounds(this.state);

        let zoom = TLDR.get_camera_zoom(
            Math.min(
                (rendererBounds.width - FIT_TO_SCREEN_PADDING) /
                    selectedBounds.width,
                (rendererBounds.height - FIT_TO_SCREEN_PADDING) /
                    selectedBounds.height
            )
        );

        zoom =
            this.camera.zoom === zoom || this.camera.zoom < 1
                ? Math.min(1, zoom)
                : zoom;

        const mx =
            (rendererBounds.width - selectedBounds.width * zoom) / 2 / zoom;
        const my =
            (rendererBounds.height - selectedBounds.height * zoom) / 2 / zoom;

        return this.setCamera(
            Vec.toFixed(
                Vec.sub([mx, my], [selectedBounds.minX, selectedBounds.minY])
            ),
            zoom,
            `zoomed_to_selection`
        );
    };

    /**
     * Zoom back to content when the canvas is empty.
     */
    zoomToContent = (): this => {
        const shapes = this.shapes;
        const pageState = this.pageState;

        if (shapes.length === 0) return this;

        const { rendererBounds } = this;
        const { zoom } = pageState.camera;
        const commonBounds = Utils.getCommonBounds(shapes.map(TLDR.get_bounds));

        const mx =
            (rendererBounds.width - commonBounds.width * zoom) / 2 / zoom;
        const my =
            (rendererBounds.height - commonBounds.height * zoom) / 2 / zoom;

        return this.setCamera(
            Vec.toFixed(
                Vec.sub([mx, my], [commonBounds.minX, commonBounds.minY])
            ),
            this.camera.zoom,
            `zoomed_to_content`
        );
    };

    zoomToShapes = (shapes: TDShape[]): this => {
        const pageState = this.pageState;

        if (shapes.length === 0) {
            return this;
        }

        const { rendererBounds } = this;
        const { zoom } = pageState.camera;
        const commonBounds = Utils.getCommonBounds(shapes.map(TLDR.get_bounds));

        const mx =
            (rendererBounds.width - commonBounds.width * zoom) / 2 / zoom;
        const my =
            (rendererBounds.height - commonBounds.height * zoom) / 2 / zoom;

        return this.setCamera(
            Vec.toFixed(
                Vec.sub([mx, my], [commonBounds.minX, commonBounds.minY])
            ),
            this.camera.zoom,
            `zoomed_to_shapes`
        );
    };

    /**
     * Zoom the camera to 100%.
     */
    resetZoom = (): this => {
        return this.zoomTo(1);
    };

    /**
     * Zoom the camera by a certain delta.
     * @param delta The zoom delta.
     * @param center The point to zoom toward.
     */
    zoomBy = Utils.throttle((delta: number, center?: number[]): this => {
        const { zoom } = this.camera;
        const nextZoom = TLDR.get_camera_zoom(zoom - delta * zoom);
        return this.zoomTo(nextZoom, center);
    }, 16);

    /* -------------------------------------------------- */
    /*                      Selection                     */
    /* -------------------------------------------------- */

    /**
     * Clear the selection history (undo/redo stack for selection).
     */
    private clear_select_history = (): this => {
        this.selectHistory.pointer = 0;
        this.selectHistory.stack = [this.selectedIds];
        return this;
    };

    /**
     * Adds a selection to the selection history (undo/redo stack for selection).
     */
    private add_to_select_history = (ids: string[]): this => {
        if (this.selectHistory.pointer < this.selectHistory.stack.length) {
            this.selectHistory.stack = this.selectHistory.stack.slice(
                0,
                this.selectHistory.pointer + 1
            );
        }
        this.selectHistory.pointer++;
        this.selectHistory.stack.push(ids);
        return this;
    };

    /**
     * Set the current selection.
     * @param ids The ids to select
     * @param push Whether to add the ids to the current selection instead.
     */
    private set_selected_ids = (ids: string[], push = false): this => {
        const nextIds = push
            ? [...this.pageState.selectedIds, ...ids]
            : [...ids];
        return this.patchState(
            {
                appState: {
                    activeTool: 'select',
                },
                document: {
                    pageStates: {
                        [this.currentPageId]: {
                            selectedIds: nextIds,
                        },
                    },
                },
            },
            `selected`
        );
    };

    /**
     * Undo the most recent selection.
     */
    undoSelect = (): this => {
        if (this.selectHistory.pointer > 0) {
            this.selectHistory.pointer--;
            this.set_selected_ids(
                this.selectHistory.stack[this.selectHistory.pointer]
            );
        }
        return this;
    };

    /**
     * Redo the previous selection.
     */
    redoSelect = (): this => {
        if (this.selectHistory.pointer < this.selectHistory.stack.length - 1) {
            this.selectHistory.pointer++;
            this.set_selected_ids(
                this.selectHistory.stack[this.selectHistory.pointer]
            );
        }
        return this;
    };

    /**
     * Select one or more shapes.
     * @param ids The shape ids to select.
     */
    select = (...ids: string[]): this => {
        ids.forEach(id => {
            if (!this.page.shapes[id]) {
                throw Error(
                    `That shape does not exist on page ${this.currentPageId}`
                );
            }
        });
        this.set_selected_ids(ids);
        this.add_to_select_history(ids);
        return this;
    };

    /**
     * Select all shapes on the page.
     */
    selectAll = (pageId = this.currentPageId): this => {
        if (this.session) return this;

        // Select only shapes that are the direct child of the page
        this.set_selected_ids(
            Object.values(this.document.pages[pageId].shapes)
                .filter(shape => shape.parentId === pageId)
                .map(shape => shape.id)
        );

        this.add_to_select_history(this.selectedIds);

        this.selectTool('select');

        return this;
    };

    /**
     * Deselect any selected shapes.
     */
    selectNone = (): this => {
        this.set_selected_ids([]);
        this.add_to_select_history(this.selectedIds);
        return this;
    };

    /* -------------------------------------------------- */
    /*                      Sessions                 p      */
    /* -------------------------------------------------- */

    /**
     * Start a new session.
     * @param session The new session
     * @param args arguments of the session's start method.
     */
    startSession = <T extends SessionType, A extends any[] = any[]>(
        type: T,
        ...args: A
    ): this => {
        if (this.readOnly && type !== SessionType.Brush) return this;
        if (this.session) {
            TLDR.warn(
                `Already in a session! (${this.session.constructor.name})`
            );
            this.cancelSession();
        }

        const Session = this.getSession(type);

        // @ts-ignore
        this.session = new Session(this, ...args);

        const result = this.session.start();

        if (result) {
            this.patchState(
                result,
                `session:start_${this.session.constructor.name}`
            );
        }

        return this;
        // return this.setStatus(this.session.status)
    };

    /**
     * updateSession.
     * @param args The arguments of the current session's update method.
     */
    updateSession = (): this => {
        const { session } = this;
        if (!session) return this;

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const patch = session.update();
        if (!patch) return this;
        return this.patchState(patch, `session:${session?.constructor.name}`);
    };

    /**
     * Cancel the current session.
     * @param args The arguments of the current session's cancel method.
     */
    cancelSession = (): this => {
        const { session } = this;
        if (!session) return this;
        this.session = undefined;

        const result = session.cancel();

        if (result) {
            this.patchState(
                result,
                `session:cancel:${session.constructor.name}`
            );
        }

        return this;
    };

    /**
     * Complete the current session.
     * @param args The arguments of the current session's complete method.
     */
    completeSession = (): this => {
        const { session } = this;

        if (!session) return this;
        this.session = undefined;
        const result = session.complete();

        if (result === undefined) {
            this.isCreating = false;

            return this.patchState(
                {
                    appState: {
                        status: TDStatus.Idle,
                    },
                    document: {
                        pageStates: {
                            [this.currentPageId]: {
                                editingId: undefined,
                                bindingId: undefined,
                                hoveredId: undefined,
                            },
                        },
                    },
                },
                `session:complete:${session.constructor.name}`
            );
        } else if ('after' in result) {
            // Session ended with a command

            if (this.isCreating) {
                // We're currently creating a shape. Override the command's
                // before state so that when we undo the command, we remove
                // the shape we just created.
                result.before = {
                    appState: {
                        ...result.before.appState,
                        status: TDStatus.Idle,
                    },
                    document: {
                        pages: {
                            [this.currentPageId]: {
                                shapes: Object.fromEntries(
                                    this.selectedIds.map(id => [id, undefined])
                                ),
                            },
                        },
                        pageStates: {
                            [this.currentPageId]: {
                                selectedIds: [],
                                editingId: null,
                                bindingId: null,
                                hoveredId: null,
                            },
                        },
                    },
                };

                if (this.appState.isToolLocked) {
                    const pageState =
                        result.after?.document?.pageStates?.[
                            this.currentPageId
                        ] || {};
                    pageState.selectedIds = [];
                }

                this.isCreating = false;
            }

            result.after.appState = {
                ...result.after.appState,
                status: TDStatus.Idle,
            };

            result.after.document = {
                ...result.after.document,
                pageStates: {
                    ...result.after.document?.pageStates,
                    [this.currentPageId]: {
                        ...(result.after.document?.pageStates || {})[
                            this.currentPageId
                        ],
                        editingId: null,
                    },
                },
            };

            this.set_state(
                result,
                `session:complete:${session.constructor.name}`
            );
        } else {
            this.patchState(
                {
                    ...result,
                    appState: {
                        ...result.appState,
                        status: TDStatus.Idle,
                    },
                    document: {
                        ...result.document,
                        pageStates: {
                            [this.currentPageId]: {
                                ...result.document?.pageStates?.[
                                    this.currentPageId
                                ],
                                editingId: null,
                            },
                        },
                    },
                },
                `session:complete:${session.constructor.name}`
            );
        }

        return this;
    };

    /* -------------------------------------------------- */
    /*                   Shape Functions                  */
    /* -------------------------------------------------- */

    /**
     * Manually create shapes on the page.
     * @param shapes An array of shape partials, containing the initial props for the shapes.
     * @command
     */
    createShapes = (
        ...shapes: ({ id: string; type: TDShapeType } & Partial<TDShape>)[]
    ): this => {
        if (shapes.length === 0) return this;

        return this.create(
            shapes.map(shape => {
                return TLDR.get_shape_util(shape.type).create({
                    parentId: this.currentPageId,
                    workspace: this.document.id,
                    ...shape,
                });
            })
        );
    };

    /**
     * Manually update a set of shapes.
     * @param shapes An array of shape partials, containing the changes to be made to each shape.
     * @command
     */
    updateShapes = (...shapes: ({ id: string } & Partial<TDShape>)[]): this => {
        const pageShapes = this.document.pages[this.currentPageId].shapes;
        const shapesToUpdate = shapes.filter(shape => pageShapes[shape.id]);
        if (shapesToUpdate.length === 0) return this;
        return this.set_state(
            this.commands.updateShapes(
                this,
                shapesToUpdate,
                this.currentPageId
            ),
            'updated_shapes'
        );
    };

    // createTextShapeAtPoint(point: number[], id?: string): this {
    //     const {
    //         shapes,
    //         appState: { currentPageId, currentStyle }
    //     } = this;

    //     const childIndex =
    //         shapes.length === 0
    //             ? 1
    //             : shapes
    //                   .filter(shape => shape.parentId === currentPageId)
    //                   .sort((a, b) => b.childIndex - a.childIndex)[0]
    //                   .childIndex + 1;

    //     const Text = shapeUtils[TDShapeType.Text];

    //     const newShape = Text.create({
    //         id: id || Utils.uniqueId(),
    //         parentId: currentPageId,
    //         childIndex,
    //         point,
    //         style: { ...currentStyle }
    //     });

    //     const bounds = Text.getBounds(newShape);
    //     newShape.point = Vec.sub(newShape.point, [
    //         bounds.width / 2,
    //         bounds.height / 2
    //     ]);
    //     this.createShapes(newShape);
    //     this.setEditingId(newShape.id);

    //     return this;
    // }

    createImageOrVideoShapeAtPoint(
        id: string,
        type: TDShapeType.Image | TDShapeType.Video,
        point: number[],
        size: number[],
        assetId: string
    ): this {
        const {
            shapes,
            appState: { currentPageId, currentStyle },
            document: { id: workspace },
        } = this;

        const childIndex =
            shapes.length === 0
                ? 1
                : shapes
                      .filter(shape => shape.parentId === currentPageId)
                      .sort((a, b) => b.childIndex - a.childIndex)[0]
                      .childIndex + 1;

        const Shape = shapeUtils[type];

        // Ensure that the pasted shape fits inside of the current viewport

        if (size[0] > this.viewport.width) {
            const r = size[1] / size[0];
            size[0] =
                this.viewport.width -
                (FIT_TO_SCREEN_PADDING / this.camera.zoom) * 2;
            size[1] = size[0] * r;
            if (size[1] < 32 || size[1] < 32) {
                size[1] = 32;
                size[0] = size[1] / r;
            }
        } else if (size[1] > this.viewport.height) {
            const r = size[0] / size[1];
            size[1] =
                this.viewport.height -
                (FIT_TO_SCREEN_PADDING / this.camera.zoom) * 2;
            size[0] = size[1] * r;
            if (size[1] < 32 || size[1] < 32) {
                size[0] = 32;
                size[1] = size[0] / r;
            }
        }

        const newShape = Shape.create({
            id,
            parentId: currentPageId,
            childIndex,
            point,
            size,
            style: { ...currentStyle },
            assetId,
            workspace,
        });

        const bounds = Shape.getBounds(newShape as never);

        newShape.point = Vec.sub(newShape.point, [
            bounds.width / 2,
            bounds.height / 2,
        ]);

        this.createShapes(newShape);

        return this;
    }

    /**
     * Create one or more shapes.
     * @param shapes An array of shapes.
     * @command
     */
    create = (shapes: TDShape[] = [], bindings: TDBinding[] = []): this => {
        if (shapes.length === 0) return this;
        return this.set_state(
            this.commands.createShapes(this, shapes, bindings)
        );
    };

    /**
     * Patch in a new set of shapes
     * @param shapes
     * @param bindings
     */
    patchCreate = (
        shapes: TDShape[] = [],
        bindings: TDBinding[] = []
    ): this => {
        if (shapes.length === 0) return this;
        return this.patchState(
            this.commands.createShapes(this, shapes, bindings).after
        );
    };

    /**
     * Delete one or more shapes.
     * @param ids The ids of the shapes to delete.
     * @command
     */
    delete = (ids = this.selectedIds): this => {
        if (ids.length === 0) return this;
        const drawCommand = this.commands.deleteShapes(this, ids);

        if (
            this.callbacks.onAssetDelete &&
            drawCommand.before.document?.assets &&
            drawCommand.after.document?.assets
        ) {
            const beforeAssetIds = Object.keys(
                drawCommand.before.document.assets
            ).filter(k => !!drawCommand.before.document!.assets![k]);
            const afterAssetIds = Object.keys(
                drawCommand.after.document.assets
            ).filter(k => !!drawCommand.after.document!.assets![k]);

            const intersection = beforeAssetIds.filter(
                x => !afterAssetIds.includes(x)
            );
            intersection.forEach(id => this.callbacks.onAssetDelete!(this, id));
        }

        return this.set_state(drawCommand);
    };

    /**
     * Delete all shapes on the page.
     */
    deleteAll = (): this => {
        this.selectAll();
        this.delete();
        return this;
    };

    /**
     * Change the style for one or more shapes.
     * @param style A style partial to apply to the shapes.
     * @param ids The ids of the shapes to change (defaults to selection).
     */
    style = (style: Partial<ShapeStyles>, ids = this.selectedIds): this => {
        return this.set_state(this.commands.styleShapes(this, ids, style));
    };

    /**
     * Align one or more shapes.
     * @param direction Whether to align horizontally or vertically.
     * @param ids The ids of the shapes to change (defaults to selection).
     */
    align = (type: AlignType, ids = this.selectedIds): this => {
        if (ids.length < 2) return this;
        return this.set_state(this.commands.alignShapes(this, ids, type));
    };

    /**
     * Distribute one or more shapes.
     * @param direction Whether to distribute horizontally or vertically..
     * @param ids The ids of the shapes to change (defaults to selection).
     */
    distribute = (direction: DistributeType, ids = this.selectedIds): this => {
        if (ids.length < 3) return this;
        return this.set_state(
            this.commands.distributeShapes(this, ids, direction)
        );
    };

    /**
     * Stretch one or more shapes to their common bounds.
     * @param direction Whether to stretch horizontally or vertically.
     * @param ids The ids of the shapes to change (defaults to selection).
     */
    stretch = (direction: StretchType, ids = this.selectedIds): this => {
        if (ids.length < 2) return this;
        return this.set_state(
            this.commands.stretchShapes(this, ids, direction)
        );
    };

    /**
     * Flip one or more shapes horizontally.
     * @param ids The ids of the shapes to change (defaults to selection).
     */
    flipHorizontal = (ids = this.selectedIds): this => {
        if (ids.length === 0) return this;
        return this.set_state(
            this.commands.flipShapes(this, ids, FlipType.Horizontal)
        );
    };

    /**
     * Flip one or more shapes vertically.
     * @param ids The ids of the shapes to change (defaults to selection).
     */
    flipVertical = (ids = this.selectedIds): this => {
        if (ids.length === 0) return this;
        return this.set_state(
            this.commands.flipShapes(this, ids, FlipType.Vertical)
        );
    };

    /**
     * Move one or more shapes to a new page. Will also break or move bindings.
     * @param toPageId The id of the page to move the shapes to.
     * @param fromPageId The id of the page to move the shapes from (defaults to current page).
     * @param ids The ids of the shapes to move (defaults to selection).
     */
    moveToPage = (
        toPageId: string,
        fromPageId = this.currentPageId,
        ids = this.selectedIds
    ): this => {
        if (ids.length === 0) return this;
        const { rendererBounds } = this;
        this.set_state(
            this.commands.moveShapesToPage(
                this,
                ids,
                rendererBounds,
                fromPageId,
                toPageId
            )
        );
        return this;
    };

    /**
     * Move one or more shapes to the back of the page.
     * @param ids The ids of the shapes to change (defaults to selection).
     */
    moveToBack = (ids = this.selectedIds): this => {
        if (ids.length === 0) return this;
        return this.set_state(
            this.commands.reorderShapes(this, ids, MoveType.ToBack)
        );
    };

    /**
     * Move one or more shapes backward on of the page.
     * @param ids The ids of the shapes to change (defaults to selection).
     */
    moveBackward = (ids = this.selectedIds): this => {
        if (ids.length === 0) return this;
        return this.set_state(
            this.commands.reorderShapes(this, ids, MoveType.Backward)
        );
    };

    /**
     * Move one or more shapes forward on the page.
     * @param ids The ids of the shapes to change (defaults to selection).
     */
    moveForward = (ids = this.selectedIds): this => {
        if (ids.length === 0) return this;
        return this.set_state(
            this.commands.reorderShapes(this, ids, MoveType.Forward)
        );
    };

    /**
     * Move one or more shapes to the front of the page.
     * @param ids The ids of the shapes to change (defaults to selection).
     */
    moveToFront = (ids = this.selectedIds): this => {
        if (ids.length === 0) return this;
        return this.set_state(
            this.commands.reorderShapes(this, ids, MoveType.ToFront)
        );
    };

    /**
     * Nudge one or more shapes in a direction.
     * @param delta The direction to nudge the shapes.
     * @param isMajor Whether this is a major (i.e. shift) nudge.
     * @param ids The ids to change (defaults to selection).
     */
    nudge = (
        delta: number[],
        isMajor = false,
        ids = this.selectedIds
    ): this => {
        if (ids.length === 0) return this;
        const size = isMajor
            ? this.settings.showGrid
                ? this.currentGrid * 4
                : 10
            : this.settings.showGrid
            ? this.currentGrid
            : 1;

        return this.set_state(
            this.commands.translateShapes(this, ids, Vec.mul(delta, size))
        );
    };

    /**
     * Duplicate one or more shapes.
     * @param ids The ids to duplicate (defaults to selection).
     */
    duplicate = (ids = this.selectedIds, point?: number[]): this => {
        if (this.readOnly) return this;
        if (ids.length === 0) return this;
        return this.set_state(this.commands.duplicateShapes(this, ids, point));
    };

    /**
     * Reset the bounds for one or more shapes. Usually when the
     * bounding box of a shape is double-clicked. Different shapes may
     * handle this differently.
     * @param ids The ids to change (defaults to selection).
     */
    resetBounds = (ids = this.selectedIds): this => {
        const command = this.commands.resetBounds(
            this,
            ids,
            this.currentPageId
        );
        return this.set_state(
            this.commands.resetBounds(this, ids, this.currentPageId),
            command.id
        );
    };

    /**
     * Toggle the hidden property of one or more shapes.
     * @param ids The ids to change (defaults to selection).
     */
    toggleHidden = (ids = this.selectedIds): this => {
        if (ids.length === 0) return this;
        return this.set_state(
            this.commands.toggleShapesProp(this, ids, 'isHidden')
        );
    };

    /**
     * Toggle the locked property of one or more shapes.
     * @param ids The ids to change (defaults to selection).
     */
    toggleLocked = (ids = this.selectedIds): this => {
        if (ids.length === 0) return this;
        return this.set_state(
            this.commands.toggleShapesProp(this, ids, 'isLocked')
        );
    };

    lock = (ids = this.selectedIds): this => {
        if (ids.length === 0) {
            return this;
        }
        return this.set_state(
            this.commands.setShapesLockStatus(this, ids, true)
        );
    };

    unlock = (ids = this.selectedIds): this => {
        if (ids.length === 0) {
            return this;
        }
        return this.set_state(
            this.commands.setShapesLockStatus(this, ids, false)
        );
    };

    /**
     * Toggle the fixed-aspect-ratio property of one or more shapes.
     * @param ids The ids to change (defaults to selection).
     */
    toggleAspectRatioLocked = (ids = this.selectedIds): this => {
        if (ids.length === 0) return this;
        return this.set_state(
            this.commands.toggleShapesProp(this, ids, 'isAspectRatioLocked')
        );
    };

    /**
     * Toggle the decoration at a handle of one or more shapes.
     * @param handleId The handle to toggle.
     * @param ids The ids of the shapes to toggle the decoration on.
     */
    toggleDecoration = (handleId: string, ids = this.selectedIds): this => {
        if (ids.length === 0 || !(handleId === 'start' || handleId === 'end'))
            return this;
        return this.set_state(
            this.commands.toggleShapesDecoration(this, ids, handleId)
        );
    };

    /**
     * Set the props of one or more shapes
     * @param props The props to set on the shapes.
     * @param ids The ids of the shapes to set props on.
     */
    setShapeProps = <T extends TDShape>(
        props: Partial<T>,
        ids = this.selectedIds
    ) => {
        return this.set_state(this.commands.setShapesProps(this, ids, props));
    };

    /**
     * Rotate one or more shapes by a delta.
     * @param delta The delta in radians.
     * @param ids The ids to rotate (defaults to selection).
     */
    rotate = (delta = Math.PI * -0.5, ids = this.selectedIds): this => {
        if (ids.length === 0) return this;
        const change = this.commands.rotateShapes(this, ids, delta);
        if (!change) return this;
        return this.set_state(change);
    };

    /**
     * Group the selected shapes.
     * @param ids The ids to group (defaults to selection).
     * @param groupId The new group's id.
     */
    group = (
        ids = this.selectedIds,
        groupId = Utils.uniqueId(),
        pageId = this.currentPageId
    ): this => {
        if (this.readOnly) return this;

        if (
            ids.length === 1 &&
            this.getShape(ids[0], pageId).type === TDShapeType.Group
        ) {
            return this.ungroup(ids, pageId);
        }

        if (ids.length < 2) return this;

        const command = this.commands.groupShapes(this, ids, groupId, pageId);
        if (!command) return this;
        return this.set_state(command);
    };

    /**
     * Ungroup the selected groups.
     * @todo
     */
    ungroup = (ids = this.selectedIds, pageId = this.currentPageId): this => {
        if (this.readOnly) return this;

        const groups = ids
            .map(id => this.getShape(id, pageId))
            .filter(shape => shape.type === TDShapeType.Group);

        if (groups.length === 0) return this;

        const command = this.commands.ungroupShapes(
            this,
            ids,
            groups as GroupShape[],
            pageId
        );

        if (!command) {
            return this;
        }

        return this.set_state(command);
    };

    /**
     * Cancel the current session.
     */
    cancel = (): this => {
        this.currentTool.onCancel?.();

        return this;
    };

    addMediaFromFile = async (file: File, point = this.centerPoint) => {
        this.setIsLoading(true);

        const id = Utils.uniqueId();
        const pagePoint = this.getPagePoint(point);
        const extension = file.name.match(/\.[0-9a-z]+$/i);

        if (!extension) throw Error('No extension');

        const isImage = IMAGE_EXTENSIONS.includes(extension[0].toLowerCase());
        const isVideo = VIDEO_EXTENSIONS.includes(extension[0].toLowerCase());

        if (!(isImage || isVideo)) throw Error('Wrong extension');

        const shapeType = isImage ? TDShapeType.Image : TDShapeType.Video;
        const assetType = isImage ? TDAssetType.Image : TDAssetType.Video;

        let src: string | ArrayBuffer | null;

        try {
            if (this.callbacks.onAssetCreate) {
                const result = await this.callbacks.onAssetCreate(
                    this,
                    file,
                    id
                );

                if (!result)
                    throw Error('Asset creation callback returned false');

                src = result;
            } else {
                src = await fileToBase64(file);
            }

            if (typeof src === 'string') {
                let size = [0, 0];

                if (isImage) {
                    // attempt to get actual svg size from viewBox attribute as
                    if (extension[0] == '.svg') {
                        let viewBox: string[];
                        const svgString = await fileToText(file);
                        const viewBoxAttribute =
                            this.get_viewbox_from_svg(svgString);

                        if (viewBoxAttribute) {
                            viewBox = viewBoxAttribute.split(' ');
                            size[0] = parseFloat(viewBox[2]);
                            size[1] = parseFloat(viewBox[3]);
                        }
                    }
                    if (Vec.isEqual(size, [0, 0])) {
                        size = await getImageSizeFromSrc(src);
                    }
                } else {
                    size = await getVideoSizeFromSrc(src);
                }

                const match = Object.values(this.document.assets).find(
                    asset => asset.type === assetType && asset.src === src
                );

                let assetId: string;

                if (!match) {
                    assetId = Utils.uniqueId();

                    const asset = {
                        id: assetId,
                        type: assetType,
                        name: file.name,
                        src,
                        size,
                    };

                    this.patchState({
                        document: {
                            assets: {
                                [assetId]: asset,
                            },
                        },
                    });
                } else {
                    assetId = match.id;
                }

                this.createImageOrVideoShapeAtPoint(
                    id,
                    shapeType,
                    pagePoint,
                    size,
                    assetId
                );
            }
        } catch (error) {
            console.warn(error);
            this.setIsLoading(false);
            return this;
        }

        this.setIsLoading(false);
        return this;
    };

    private get_viewbox_from_svg = (svgStr: string | ArrayBuffer | null) => {
        const viewBoxRegex =
            /.*?viewBox=["'](-?[\d.]+[, ]+-?[\d.]+[, ][\d.]+[, ][\d.]+)["']/;

        if (typeof svgStr === 'string') {
            const matches = svgStr.match(viewBoxRegex);
            return matches && matches.length >= 2 ? matches[1] : null;
        }

        console.warn('could not get viewbox from svg string');

        this.setIsLoading(false);

        return null;
    };

    /* -------------------------------------------------- */
    /*                   Event Handlers                   */
    /* -------------------------------------------------- */

    /* ----------------- Keyboard Events ---------------- */

    onKeyDown: TLKeyboardEventHandler = (key, info, e) => {
        switch (e.key) {
            case '/': {
                if (this.status === 'idle' && !this.pageState.editingId) {
                    const { shiftKey, metaKey, altKey, ctrlKey, spaceKey } =
                        this;

                    this.onPointerDown(
                        {
                            target: 'canvas',
                            pointerId: 0,
                            origin: info.point,
                            point: info.point,
                            delta: [0, 0],
                            pressure: 0.5,
                            shiftKey,
                            ctrlKey,
                            metaKey,
                            altKey,
                            spaceKey,
                        },
                        {
                            shiftKey,
                            altKey,
                            ctrlKey,
                            pointerId: 0,
                            clientX: info.point[0],
                            clientY: info.point[1],
                        } as unknown as React.PointerEvent<HTMLDivElement>
                    );
                }
                break;
            }
            case 'Escape': {
                this.cancel();
                break;
            }
            case 'Meta': {
                this.metaKey = true;
                break;
            }
            case 'Alt': {
                this.altKey = true;
                break;
            }
            case 'Control': {
                this.ctrlKey = true;
                break;
            }
            case ' ': {
                this.patchState({
                    settings: {
                        forcePanning: true,
                    },
                });
                this.spaceKey = true;
                break;
            }
        }

        this.currentTool.onKeyDown?.(key, info, e);

        return this;
    };

    onKeyUp: TLKeyboardEventHandler = (key, info, e) => {
        if (!info) return;

        switch (e.key) {
            case '/': {
                const {
                    currentPoint,
                    shiftKey,
                    metaKey,
                    altKey,
                    ctrlKey,
                    spaceKey,
                } = this;

                this.onPointerUp(
                    {
                        target: 'canvas',
                        pointerId: 0,
                        origin: currentPoint,
                        point: currentPoint,
                        delta: [0, 0],
                        pressure: 0.5,
                        shiftKey,
                        ctrlKey,
                        metaKey,
                        altKey,
                        spaceKey,
                    },
                    {
                        shiftKey,
                        altKey,
                        ctrlKey,
                        pointerId: 0,
                        clientX: currentPoint[0],
                        clientY: currentPoint[1],
                    } as unknown as React.PointerEvent<HTMLDivElement>
                );
                break;
            }
            case 'Meta': {
                this.metaKey = false;
                break;
            }
            case 'Alt': {
                this.altKey = false;
                break;
            }
            case 'Control': {
                this.ctrlKey = false;
                break;
            }
            case ' ': {
                this.patchState({
                    settings: {
                        forcePanning:
                            this.currentTool.type === TDShapeType.HandDraw,
                    },
                });
                this.spaceKey = false;
                break;
            }
        }

        this.currentTool.onKeyUp?.(key, info, e);
    };

    /** Force bounding boxes to reset when the document loads. */
    refreshBoundingBoxes = () => {
        // force a change to every text shape
        const force = this.shapes.map(shape => {
            return [
                shape.id,
                {
                    point: [...shape.point],
                    ...('label' in shape && { label: '' }),
                },
            ];
        });

        const restore = this.shapes.map(shape => {
            return [
                shape.id,
                {
                    point: [...shape.point],
                    ...('label' in shape && { label: shape.label }),
                },
            ];
        });

        clearPrevSize();

        this.patchState({
            document: {
                pages: {
                    [this.currentPageId]: {
                        shapes: Object.fromEntries(force),
                    },
                },
            },
        });
        this.patchState({
            document: {
                pages: {
                    [this.currentPageId]: {
                        shapes: Object.fromEntries(restore),
                    },
                },
            },
        });
    };

    /* ------------- Renderer Event Handlers ------------ */

    onDragOver: TLDropEventHandler = e => {
        e.preventDefault();
    };

    onDrop: TLDropEventHandler = async e => {
        e.preventDefault();
        if (this.disableAssets) return this;
        if (e.dataTransfer.files?.length) {
            const file = e.dataTransfer.files[0];
            this.addMediaFromFile(file, [e.clientX, e.clientY]);
        }
        return this;
    };

    onPinchStart: TLPinchEventHandler = (info, e) => {
        this.currentTool.onPinchStart?.(info, e);
    };

    onPinchEnd: TLPinchEventHandler = (info, e) =>
        this.currentTool.onPinchEnd?.(info, e);

    onPinch: TLPinchEventHandler = (info, e) =>
        this.currentTool.onPinch?.(info, e);

    onPan: TLWheelEventHandler = (info, e) => {
        if (this.appState.status === 'pinching') return;
        // TODO: Pan and pinchzoom are firing at the same time. Considering turning one of them off!

        const delta = Vec.div(info.delta, this.camera.zoom);
        const prev = this.camera.point;
        const next = Vec.sub(prev, delta);

        if (Vec.isEqual(next, prev)) return;

        this.pan(delta);

        // When panning, we also want to call onPointerMove, except when "force panning" via spacebar / middle wheel button (it's called elsewhere in that case)
        if (!this.useStore.getState().settings.forcePanning)
            this.onPointerMove(info, e as unknown as React.PointerEvent);
    };

    onZoom: TLWheelEventHandler = (info, e) => {
        if (this.state.appState.status !== TDStatus.Idle) return;
        // Normalize zoom scroll
        // Fix https://github.com/toeverything/AFFiNE/issues/135
        const delta =
            Math.abs(info.delta[2]) > 10
                ? 0.2 * Math.sign(info.delta[2])
                : info.delta[2] / 50;
        this.zoomBy(delta, info.point);
        this.onPointerMove(info, e as unknown as React.PointerEvent);
    };

    /* ----------------- Pointer Events ----------------- */

    updateInputs: TLPointerEventHandler = info => {
        this.currentPoint = this.getPagePoint(info.point).concat(info.pressure);
        this.shiftKey = info.shiftKey;
        this.altKey = info.altKey;
        this.ctrlKey = info.ctrlKey;
        this.metaKey = info.metaKey;
    };

    onPointerMove: TLPointerEventHandler = (info, e) => {
        this.previousPoint = this.currentPoint;
        this.updateInputs(info, e);
        if (this.useStore.getState().settings.forcePanning && this.isPointing) {
            this.onPan?.(
                { ...info, delta: Vec.neg(info.delta) },
                e as unknown as WheelEvent
            );
            return;
        }

        // Several events (e.g. pan) can trigger the same "pointer move" behavior
        this.currentTool.onPointerMove?.(info, e);

        // Move this to an emitted event
        if (this.state.room) {
            const { users, userId } = this.state.room;

            this.callbacks.onChangePresence?.(this, {
                ...users[userId],
                point: this.getPagePoint(info.point),
            });
        }
    };

    onPointerDown: TLPointerEventHandler = (info, e) => {
        if (e.buttons === 4) {
            this.patchState({
                settings: {
                    forcePanning: true,
                },
            });
        } else if (this.isPointing) {
            return;
        }
        this.isPointing = true;
        this.originPoint = this.getPagePoint(info.point).concat(info.pressure);
        this.updateInputs(info, e);
        if (this.useStore.getState().settings.forcePanning) return;
        this.currentTool.onPointerDown?.(info, e);
    };

    onPointerUp: TLPointerEventHandler = (info, e) => {
        this.isPointing = false;
        this.updateInputs(info, e);
        this.currentTool.onPointerUp?.(info, e);
    };

    // Canvas (background)
    onPointCanvas: TLCanvasEventHandler = (info, e) => {
        this.updateInputs(info, e);
        this.currentTool.onPointCanvas?.(info, e);
    };

    onDoubleClickCanvas: TLCanvasEventHandler = (info, e) => {
        this.updateInputs(info, e);
        this.currentTool.onDoubleClickCanvas?.(info, e);
    };

    onRightPointCanvas: TLCanvasEventHandler = (info, e) => {
        this.updateInputs(info, e);
        this.currentTool.onRightPointCanvas?.(info, e);
    };

    onDragCanvas: TLCanvasEventHandler = (info, e) => {
        this.updateInputs(info, e);
        this.currentTool.onDragCanvas?.(info, e);
    };

    onReleaseCanvas: TLCanvasEventHandler = (info, e) => {
        this.updateInputs(info, e);
        this.currentTool.onReleaseCanvas?.(info, e);
    };

    // Shape
    onPointShape: TLPointerEventHandler = (info, e) => {
        this.originPoint = this.getPagePoint(info.point).concat(info.pressure);
        this.updateInputs(info, e);
        this.currentTool.onPointShape?.(info, e);
    };

    onReleaseShape: TLPointerEventHandler = (info, e) => {
        this.updateInputs(info, e);
        this.currentTool.onReleaseShape?.(info, e);
    };

    onDoubleClickShape: TLPointerEventHandler = (info, e) => {
        this.originPoint = this.getPagePoint(info.point).concat(info.pressure);
        this.updateInputs(info, e);
        this.currentTool.onDoubleClickShape?.(info, e);
    };

    onRightPointShape: TLPointerEventHandler = (info, e) => {
        this.originPoint = this.getPagePoint(info.point).concat(info.pressure);
        this.updateInputs(info, e);
        this.currentTool.onRightPointShape?.(info, e);
    };

    onDragShape: TLPointerEventHandler = (info, e) => {
        this.updateInputs(info, e);
        this.currentTool.onDragShape?.(info, e);
    };

    onHoverShape: TLPointerEventHandler = (info, e) => {
        this.updateInputs(info, e);
        this.currentTool.onHoverShape?.(info, e);
    };

    onUnhoverShape: TLPointerEventHandler = (info, e) => {
        this.updateInputs(info, e);
        this.currentTool.onUnhoverShape?.(info, e);
    };

    // Bounds (bounding box background)
    onPointBounds: TLBoundsEventHandler = (info, e) => {
        this.originPoint = this.getPagePoint(info.point).concat(info.pressure);
        this.updateInputs(info, e);
        this.currentTool.onPointBounds?.(info, e);
    };

    onDoubleClickBounds: TLBoundsEventHandler = (info, e) => {
        this.originPoint = this.getPagePoint(info.point).concat(info.pressure);
        this.updateInputs(info, e);
        this.currentTool.onDoubleClickBounds?.(info, e);
    };

    onRightPointBounds: TLBoundsEventHandler = (info, e) => {
        this.originPoint = this.getPagePoint(info.point).concat(info.pressure);
        this.updateInputs(info, e);
        this.currentTool.onRightPointBounds?.(info, e);
    };

    onDragBounds: TLBoundsEventHandler = (info, e) => {
        this.updateInputs(info, e);
        this.currentTool.onDragBounds?.(info, e);
    };

    onHoverBounds: TLBoundsEventHandler = (info, e) => {
        this.updateInputs(info, e);
        this.currentTool.onHoverBounds?.(info, e);
    };

    onUnhoverBounds: TLBoundsEventHandler = (info, e) => {
        this.updateInputs(info, e);
        this.currentTool.onUnhoverBounds?.(info, e);
    };

    onReleaseBounds: TLBoundsEventHandler = (info, e) => {
        this.updateInputs(info, e);
        this.currentTool.onReleaseBounds?.(info, e);
    };

    // Bounds handles (corners, edges)
    onPointBoundsHandle: TLBoundsHandleEventHandler = (info, e) => {
        this.originPoint = this.getPagePoint(info.point).concat(info.pressure);
        this.updateInputs(info, e);
        this.currentTool.onPointBoundsHandle?.(info, e);
    };

    onDoubleClickBoundsHandle: TLBoundsHandleEventHandler = (info, e) => {
        this.originPoint = this.getPagePoint(info.point).concat(info.pressure);
        this.updateInputs(info, e);
        this.currentTool.onDoubleClickBoundsHandle?.(info, e);

        // hack time to reset the size / clipping of an image
        if (this.selectedIds.length !== 1) return;

        const shape = this.getShape(this.selectedIds[0]);

        if (
            shape.type === TDShapeType.Image ||
            shape.type === TDShapeType.Video
        ) {
            const asset = this.document.assets[shape.assetId];
            const util = TLDR.get_shape_util(shape);
            const centerA = util.getCenter(shape);
            const centerB = util.getCenter({ ...shape, size: asset.size });
            const delta = Vec.sub(centerB, centerA);

            this.updateShapes({
                id: shape.id,
                point: Vec.sub(shape.point, delta),
                size: asset.size,
            });
        }
    };

    onRightPointBoundsHandle: TLBoundsHandleEventHandler = (info, e) => {
        this.originPoint = this.getPagePoint(info.point).concat(info.pressure);
        this.updateInputs(info, e);
        this.currentTool.onRightPointBoundsHandle?.(info, e);
    };

    onDragBoundsHandle: TLBoundsHandleEventHandler = (info, e) => {
        this.updateInputs(info, e);
        this.currentTool.onDragBoundsHandle?.(info, e);
    };

    onHoverBoundsHandle: TLBoundsHandleEventHandler = (info, e) => {
        this.updateInputs(info, e);
        this.currentTool.onHoverBoundsHandle?.(info, e);
    };

    onUnhoverBoundsHandle: TLBoundsHandleEventHandler = (info, e) => {
        this.updateInputs(info, e);
        this.currentTool.onUnhoverBoundsHandle?.(info, e);
    };

    onReleaseBoundsHandle: TLBoundsHandleEventHandler = (info, e) => {
        this.updateInputs(info, e);
        this.currentTool.onReleaseBoundsHandle?.(info, e);
    };

    // Handles (ie the handles of a selected arrow)
    onPointHandle: TLPointerEventHandler = (info, e) => {
        this.originPoint = this.getPagePoint(info.point).concat(info.pressure);
        this.updateInputs(info, e);
        this.currentTool.onPointHandle?.(info, e);
    };

    onDoubleClickHandle: TLPointerEventHandler = (info, e) => {
        this.originPoint = this.getPagePoint(info.point).concat(info.pressure);
        this.updateInputs(info, e);
        this.currentTool.onDoubleClickHandle?.(info, e);
    };

    onRightPointHandle: TLPointerEventHandler = (info, e) => {
        this.originPoint = this.getPagePoint(info.point).concat(info.pressure);
        this.updateInputs(info, e);
        this.currentTool.onRightPointHandle?.(info, e);
    };

    onDragHandle: TLPointerEventHandler = (info, e) => {
        this.updateInputs(info, e);
        this.currentTool.onDragHandle?.(info, e);
    };

    onHoverHandle: TLPointerEventHandler = (info, e) => {
        this.updateInputs(info, e);
        this.currentTool.onHoverHandle?.(info, e);
    };

    onUnhoverHandle: TLPointerEventHandler = (info, e) => {
        this.updateInputs(info, e);
        this.currentTool.onUnhoverHandle?.(info, e);
    };

    onReleaseHandle: TLPointerEventHandler = (info, e) => {
        this.updateInputs(info, e);
        this.currentTool.onReleaseHandle?.(info, e);
    };

    onShapeChange = (shape: { id: string } & Partial<TDShape>) => {
        this.updateShapes(shape);
    };

    onShapeBlur = () => {
        // This prevents an auto-blur event from Safari
        if (performance.now() - this.editingStartTime < 50) return;

        const { editingId } = this.pageState;
        const { isToolLocked } = this.getAppState();

        if (editingId) {
            // If we're editing text, then delete the text if it's empty
            const shape = this.getShape(editingId);
            this.setEditingId();
            // if (shape.type === TDShapeType.Text) {
            //     if (shape.text.trim().length <= 0) {
            //         this.patchState(
            //             this.commands.deleteShapes(this, [editingId]).after,
            //             'delete_empty_text'
            //         );
            //     } else if (!isToolLocked) {
            //         this.select(editingId);
            //     }
            // }
        }

        this.currentTool.onShapeBlur?.();
    };

    onShapeClone: TLShapeCloneHandler = (info, e) => {
        this.originPoint = this.getPagePoint(info.point).concat(info.pressure);
        this.updateInputs(info, e);
        this.currentTool.onShapeClone?.(info, e);
    };

    onRenderCountChange = (ids: string[]) => {
        const appState = this.getAppState();
        if (appState.isEmptyCanvas && ids.length > 0) {
            this.patchState(
                {
                    appState: {
                        isEmptyCanvas: false,
                    },
                },
                'empty_canvas:false'
            );
        } else if (!appState.isEmptyCanvas && ids.length <= 0) {
            this.patchState(
                {
                    appState: {
                        isEmptyCanvas: true,
                    },
                },
                'empty_canvas:true'
            );
        }
    };

    onError = () => {
        // TODO:
    };

    isSelected(id: string) {
        return this.selectedIds.includes(id);
    }

    /* ----------------- Export ----------------- */

    /**
     * Get a snapshot of a video at current frame as base64 encoded image
     * @param id ID of video shape
     * @returns base64 encoded frame
     * @throws Error if video shape with given ID does not exist
     */
    serializeVideo(id: string): string {
        const video = document.getElementById(
            id + '_video'
        ) as HTMLVideoElement;
        if (video) {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d')!.drawImage(video, 0, 0);
            return canvas.toDataURL('image/png');
        } else throw new Error('Video with id ' + id + ' not found');
    }

    /**
     * Get a snapshot of a image (e.g. a GIF) as base64 encoded image
     * @param id ID of image shape
     * @returns base64 encoded frame
     * @throws Error if image shape with given ID does not exist
     */
    serializeImage(id: string): string {
        const image = document.getElementById(
            id + '_image'
        ) as HTMLImageElement;
        if (image) {
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            canvas.getContext('2d')!.drawImage(image, 0, 0);
            return canvas.toDataURL('image/png');
        } else throw new Error('Image with id ' + id + ' not found');
    }

    patchAssets(assets: TDAssets) {
        this.document.assets = {
            ...this.document.assets,
            ...assets,
        };
    }

    get room() {
        return this.state.room;
    }

    get isLocal() {
        return this.state.room === undefined || this.state.room.id === 'local';
    }

    override get status() {
        return this.appState.status;
    }

    get currentUser() {
        if (!this.state.room) return;
        return this.state.room.users[this.state.room.userId];
    }

    // The center of the component (in screen space)
    get centerPoint() {
        const { width, height } = this.rendererBounds;
        return Vec.toFixed([width / 2, height / 2]);
    }

    get currentGrid() {
        const { zoom } = this.camera;
        if (zoom < 0.15) {
            return GRID_SIZE * 16;
        } else if (zoom < 1) {
            return GRID_SIZE * 4;
        } else {
            return GRID_SIZE * 1;
        }
    }

    getShapeUtil = TLDR.get_shape_util;

    static version = 15.3;

    static default_document: TDDocument = {
        id: 'doc',
        name: 'New Document',
        version: TldrawApp.version,
        pages: {
            page: {
                id: 'page',
                name: 'Page 1',
                childIndex: 1,
                shapes: {},
                bindings: {},
            },
        },
        pageStates: {
            page: {
                id: 'page',
                selectedIds: [],
                camera: {
                    point: [0, 0],
                    zoom: 1,
                },
            },
        },
        assets: {},
    };

    static defaultState: TDSnapshot = {
        settings: {
            isCadSelectMode: false,
            isPenMode: false,
            isDarkMode: false,
            isZoomSnap: false,
            isFocusMode: false,
            isSnapping: false,
            isDebugMode: false,
            isReadonlyMode: false,
            forcePanning: false,
            keepStyleMenuOpen: false,
            nudgeDistanceLarge: 16,
            nudgeDistanceSmall: 1,
            showRotateHandles: true,
            showBindingHandles: true,
            showCloneHandles: false,
            showGrid: false,
        },
        appState: {
            status: TDStatus.Idle,
            activeTool: 'select',
            hoveredId: undefined,
            currentPageId: 'page',
            currentStyle: defaultStyle,
            isToolLocked: false,
            isMenuOpen: false,
            isEmptyCanvas: false,
            snapLines: [],
            laserLine: [],
            isLoading: false,
            disableAssets: false,
        },
        document: TldrawApp.default_document,
    };

    static asset_src = 'tldraw-assets.json';
}
