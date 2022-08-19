/* eslint-disable no-restricted-syntax */
import { HTMLContainer, TLBounds, Utils } from '@tldraw/core';
import { Vec } from '@tldraw/vec';
import { AffineEditor } from '@toeverything/components/affine-editor';
import {
    EditorShape,
    TDMeta,
    TDShapeType,
    TransformInfo,
} from '@toeverything/components/board-types';
import type { BlockEditor } from '@toeverything/components/editor-core';
import { MIN_PAGE_WIDTH } from '@toeverything/components/editor-core';
import { styled } from '@toeverything/components/ui';
import type { MouseEvent, SyntheticEvent } from 'react';
import { memo, useCallback, useEffect, useRef } from 'react';
import {
    defaultTextStyle,
    getBoundsRectangle,
    getTextSvgElement,
} from '../shared';
import { getShapeStyle } from '../shared/shape-styles';
import { TDShapeUtil } from '../TDShapeUtil';
const MemoAffineEditor = memo(AffineEditor, (prev, next) => {
    return (
        prev.workspace === next.workspace &&
        prev.rootBlockId === next.rootBlockId
    );
});

type T = EditorShape;
type E = HTMLDivElement;

export class EditorUtil extends TDShapeUtil<T, E> {
    type = TDShapeType.Editor as const;

    override canBind = true;

    override canEdit = true;

    override canClone = true;

    override showCloneHandles = true;
    /**
     * Prevent editor from being destroyed when moving out of viewport
     */
    override isStateful = true;

    getShape = (props: Partial<T>): T => {
        return Utils.deepMerge<T>(
            {
                id: props.id,
                type: TDShapeType.Editor,
                name: 'Editor',
                parentId: 'page',
                childIndex: 1,
                point: [0, 0],
                size: [MIN_PAGE_WIDTH, 200],
                rotation: 0,
                style: defaultTextStyle,
                rootBlockId: props.rootBlockId,
                workspace: props.workspace,
            },
            props
        );
    };

    Component = TDShapeUtil.Component<T, E, TDMeta>(
        ({ shape, meta: { app }, events, isEditing, onShapeChange }, ref) => {
            const containerRef = useRef<HTMLDivElement>();
            const editorRef = useRef<BlockEditor>();
            const {
                workspace,
                rootBlockId,
                size: [width, height],
            } = shape;

            const state = app.useStore();
            const { currentPageId } = state.appState;
            const { editingId } = state.document.pageStates[currentPageId];
            const { shapes } = state.document.pages[currentPageId];
            const editingText =
                editingId != null &&
                shapes[editingId].type === TDShapeType.Editor;

            const zoomLevel =
                state.document.pageStates[state.appState.currentPageId].camera
                    .zoom;

            // TODO: useEvent
            const onResize = useRef((_: ResizeObserverEntry[]) => {});

            useEffect(() => {
                onResize.current = e => {
                    const first = e[0];
                    const bounds = first.contentRect;
                    const realHeight = bounds.height;
                    if (
                        bounds.height !== 0 &&
                        Math.abs(realHeight - height) > 1
                    ) {
                        onShapeChange({
                            id: shape.id,
                            size: [width, realHeight],
                        });
                    }
                };
            }, [height, onShapeChange, shape.id, width, zoomLevel]);

            useEffect(() => {
                if (containerRef.current) {
                    const obv = new ResizeObserver(e => onResize.current(e));

                    obv.observe(containerRef.current);

                    return () => obv.disconnect();
                }
            }, [onShapeChange]);

            const stopPropagation = useCallback(
                (e: SyntheticEvent) => {
                    if (isEditing) {
                        e.stopPropagation();
                    }
                },
                [isEditing]
            );

            const activateIfEditing = useCallback(() => {
                const shapes =
                    state.document.pages[state.appState.currentPageId].shapes;
                // https://bugs.chromium.org/p/chromium/issues/detail?id=1352417
                if (shapes[shape.id] != null) {
                    return;
                }
                if (editingText && editingId !== shape.id) {
                    app.setEditingText(shape.id);
                }
            }, [app, state, shape.id, editingText, editingId]);

            useEffect(() => {
                (async () => {
                    if (isEditing) {
                        const lastBlock =
                            await editorRef.current.getLastBlock();
                        editorRef.current.selectionManager.activeNodeByNodeId(
                            lastBlock.id
                        );
                    }
                })();
            }, [isEditing]);

            const onMouseDown = useCallback(
                (e: MouseEvent) => {
                    if (e.detail === 2) {
                        app.setEditingText(shape.id);
                    }
                },
                [app, shape.id]
            );

            return (
                <HTMLContainer ref={ref} {...events}>
                    <Container
                        ref={containerRef}
                        editing={isEditing}
                        onPointerDown={stopPropagation}
                        onMouseEnter={activateIfEditing}
                        onDragEnter={activateIfEditing}
                        onMouseDown={onMouseDown}
                    >
                        <MemoAffineEditor
                            workspace={workspace}
                            rootBlockId={rootBlockId}
                            scrollBlank={false}
                            isEdgeless
                            ref={editorRef}
                        />
                        {editingText ? null : <Mask />}
                    </Container>
                </HTMLContainer>
            );
        }
    );

    Indicator = TDShapeUtil.Indicator<T>(({ shape }) => {
        const {
            size: [width, height],
        } = shape;

        return (
            <rect
                x={0}
                y={0}
                rx={3}
                ry={3}
                width={Math.max(1, width)}
                height={Math.max(1, height)}
            />
        );
    });

    getBounds = (shape: T) => {
        return getBoundsRectangle(shape, this.boundsCache);
    };

    override shouldRender = (prev: T, next: T) => {
        return (
            next.size !== prev.size ||
            next.style !== prev.style ||
            next.rootBlockId !== prev.rootBlockId ||
            next.workspace !== prev.workspace
        );
    };

    override transform = (
        shape: T,
        bounds: TLBounds,
        { scaleX, scaleY, transformOrigin }: TransformInfo<T>
    ): Partial<T> => {
        const point = Vec.toFixed([
            bounds.minX +
                (bounds.width - shape.size[0]) *
                    (scaleX < 0 ? 1 - transformOrigin[0] : transformOrigin[0]),
            bounds.minY +
                (bounds.height - shape.size[1]) *
                    (scaleY < 0 ? 1 - transformOrigin[1] : transformOrigin[1]),
        ]);

        return {
            point,
        };
    };

    override transformSingle = (shape: T, bounds: TLBounds): Partial<T> => {
        return {
            size: Vec.toFixed([
                bounds.width > MIN_PAGE_WIDTH ? MIN_PAGE_WIDTH : bounds.width,
                shape.size[1],
            ]),
        };
    };

    override getSvgElement = (
        shape: T,
        isDarkMode: boolean
    ): SVGElement | void => {
        const bounds = this.getBounds(shape);
        const textBounds = Utils.expandBounds(bounds, -PADDING);
        const textElm = getTextSvgElement(
            'This feature is currently not supported',
            shape.style,
            textBounds
        );
        const style = getShapeStyle(shape.style, isDarkMode);
        textElm.setAttribute('fill', style.fill);
        textElm.setAttribute('transform', `translate(${PADDING}, ${PADDING})`);

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const rect = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'rect'
        );
        rect.setAttribute('width', bounds.width + '');
        rect.setAttribute('height', bounds.height + '');
        rect.setAttribute('fill', style.fill);
        rect.setAttribute('rx', '3');
        rect.setAttribute('ry', '3');

        g.appendChild(rect);
        g.appendChild(textElm);

        return g;
    };
}

/* -------------------------------------------------- */
/*                       Helpers                      */
/* -------------------------------------------------- */

const PADDING = 16;
// const MIN_CONTAINER_HEIGHT = 200;

const Container = styled('div')<{ editing: boolean }>(({ editing }) => ({
    pointerEvents: 'all',
    position: 'relative',
    width: '100%',
    userSelect: editing ? 'unset' : 'none',
}));

const Mask = styled('div')({
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
});
