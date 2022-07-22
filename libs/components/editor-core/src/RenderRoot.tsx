import type { BlockEditor } from './editor';
import { Point } from '@toeverything/utils';
import { styled, usePatchNodes } from '@toeverything/components/ui';
import type { FC, PropsWithChildren } from 'react';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { RootContext } from './contexts';
import { SelectionRect, SelectionRef } from './selection';
import {
    Protocol,
    services,
    type ReturnUnobserve,
} from '@toeverything/datasource/db-service';
import { addNewGroup } from './recast-block';

interface RenderRootProps {
    editor: BlockEditor;
    editorElement: () => JSX.Element;
    /**
     * Scroll to the bottom of the article visually leave blank
     */
    scrollBlank?: boolean;
}

const MAX_PAGE_WIDTH = 5000;
export const MIN_PAGE_WIDTH = 1480;

export const RenderRoot: FC<PropsWithChildren<RenderRootProps>> = ({
    editor,
    editorElement,
    children,
}) => {
    const contentRef = useRef<HTMLDivElement>(null);
    const selectionRef = useRef<SelectionRef>(null);
    const triggeredBySelect = useRef(false);
    const [container, setContainer] = useState<HTMLDivElement>();
    const [pageWidth, setPageWidth] = useState<number>(MIN_PAGE_WIDTH);

    const { patch, has, patchedNodes } = usePatchNodes();

    editor.setReactRenderRoot({ patch, has });
    const rootId = editor.getRootBlockId();
    const fetchPageBlockWidth = useCallback(async () => {
        const dbPageBlock = await services.api.editorBlock.getBlock(
            editor.workspace,
            rootId
        );
        if (!dbPageBlock) return;
        if (dbPageBlock.getDecoration('fullWidthChecked')) {
            setPageWidth(MAX_PAGE_WIDTH);
        } else {
            setPageWidth(MIN_PAGE_WIDTH);
        }
    }, [editor.workspace, rootId]);

    useEffect(() => {
        if (container) {
            editor.container = container;
            editor.getHooks().render();
        }
    }, [editor, container]);

    useEffect(() => {
        fetchPageBlockWidth();

        let unobserve: ReturnUnobserve | undefined = undefined;
        const observe = async () => {
            unobserve = await services.api.editorBlock.observe(
                {
                    workspace: editor.workspace,
                    id: rootId,
                },
                fetchPageBlockWidth
            );
        };
        observe();
        return () => {
            unobserve?.();
        };
    }, [rootId, editor, fetchPageBlockWidth]);

    const onMouseMove = async (
        event: React.MouseEvent<HTMLDivElement, MouseEvent>
    ) => {
        selectionRef.current?.onMouseMove(event);
        if (!contentRef.current) {
            return;
        }
        const rootRect: DOMRect = contentRef.current.getBoundingClientRect();
        editor.getHooks().onRootNodeMouseMove(event, rootRect);

        const slidingBlock = await editor.getBlockByPoint(
            new Point(event.clientX, event.clientY)
        );

        if (slidingBlock && slidingBlock.dom) {
            editor.getHooks().afterOnNodeMouseMove(event, {
                blockId: slidingBlock.id,
                dom: slidingBlock.dom,
                rect: slidingBlock.dom.getBoundingClientRect(),
                rootRect: rootRect,
                type: slidingBlock.type,
                properties: slidingBlock.getProperties(),
            });
        }
    };

    const onMouseDown = (
        event: React.MouseEvent<HTMLDivElement, MouseEvent>
    ) => {
        triggeredBySelect.current = true;
        selectionRef.current?.onMouseDown(event);
        editor.getHooks().onRootNodeMouseDown(event);
    };

    const onMouseUp = (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
        selectionRef.current?.onMouseUp(event);
        editor.getHooks().onRootNodeMouseUp(event);
    };

    const onMouseOut = (
        event: React.MouseEvent<HTMLDivElement, MouseEvent>
    ) => {
        editor.getHooks().onRootNodeMouseOut(event);
    };

    const onMouseLeave = (
        event: React.MouseEvent<HTMLDivElement, MouseEvent>
    ) => {
        editor.getHooks().onRootNodeMouseLeave(event);
    };

    const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = event => {
        // IMP move into keyboard managers?
        editor.getHooks().onRootNodeKeyDown(event);
    };

    const onKeyUp: React.KeyboardEventHandler<HTMLDivElement> = event => {
        // IMP move into keyboard managers?
        editor.getHooks().onRootNodeKeyUp(event);
    };

    const onKeyDownCapture: React.KeyboardEventHandler<
        HTMLDivElement
    > = event => {
        editor.getHooks().onRootNodeKeyDownCapture(event);
    };

    const onDragOver = (event: React.DragEvent<Element>) => {
        if (!contentRef.current) {
            return;
        }
        const rootRect: DOMRect = contentRef.current.getBoundingClientRect();
        editor.dragDropManager.handlerEditorDragOver(event);
        if (editor.dragDropManager.isEnabled()) {
            editor.getHooks().onRootNodeDragOver(event, rootRect);
        }
        event.preventDefault();
    };

    const onDragOverCapture = (event: React.DragEvent<Element>) => {
        if (!contentRef.current) {
            return;
        }
        const rootRect: DOMRect = contentRef.current.getBoundingClientRect();
        if (editor.dragDropManager.isEnabled()) {
            editor.getHooks().onRootNodeDragOver(event, rootRect);
        }
    };

    const onDragEnd = (event: React.DragEvent<Element>) => {
        const rootRect: DOMRect = contentRef.current.getBoundingClientRect();
        editor.dragDropManager.handlerEditorDragEnd(event);
        editor.getHooks().onRootNodeDragEnd(event, rootRect);
    };

    const onDrop = (event: React.DragEvent<Element>) => {
        editor.dragDropManager.handlerEditorDrop(event);
        editor.getHooks().onRootNodeDrop(event);
    };

    return (
        <RootContext.Provider value={{ editor, editorElement }}>
            <Container
                isWhiteboard={editor.isWhiteboard}
                ref={ref => {
                    ref && setContainer(ref);
                }}
                onMouseMove={onMouseMove}
                onMouseDown={onMouseDown}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseLeave}
                onMouseOut={onMouseOut}
                onKeyDown={onKeyDown}
                onKeyDownCapture={onKeyDownCapture}
                onKeyUp={onKeyUp}
                onDragOver={onDragOver}
                onDragOverCapture={onDragOverCapture}
                onDragEnd={onDragEnd}
                onDrop={onDrop}
            >
                <Content
                    ref={contentRef}
                    style={{ maxWidth: pageWidth + 'px' }}
                >
                    {children}
                    {patchedNodes}
                </Content>
                {editor.isWhiteboard ? null : <ScrollBlank editor={editor} />}
                {/** TODO: remove selectionManager insert */}
                {container && editor && (
                    <SelectionRect
                        ref={selectionRef}
                        container={container}
                        editor={editor}
                    />
                )}
            </Container>
        </RootContext.Provider>
    );
};

function ScrollBlank({ editor }: { editor: BlockEditor }) {
    const mouseMoved = useRef(false);

    const onMouseDown = useCallback(() => (mouseMoved.current = false), []);
    const onMouseMove = useCallback(() => (mouseMoved.current = true), []);
    const onClick = useCallback(
        async (e: React.MouseEvent) => {
            if (mouseMoved.current) {
                mouseMoved.current = false;
                return;
            }
            const lastBlock = await editor.getRootLastChildrenBlock();

            const lastGroupBlock = await editor.getRootLastChildrenBlock();
            // If last block is not a group
            // create a group with a empty text
            if (lastGroupBlock.type !== 'group') {
                addNewGroup(editor, lastBlock, true);
                return;
            }

            if (lastGroupBlock.childrenIds.length > 1) {
                addNewGroup(editor, lastBlock, true);
                return;
            }

            // If the **only** block in the group is text and is empty
            // active the text block
            const theGroupChildBlock = await lastGroupBlock.firstChild();

            if (
                theGroupChildBlock &&
                theGroupChildBlock.type === Protocol.Block.Type.text &&
                theGroupChildBlock.blockProvider?.isEmpty()
            ) {
                await editor.selectionManager.activeNodeByNodeId(
                    theGroupChildBlock.id
                );
                return;
            }
            // else create a new group
            addNewGroup(editor, lastBlock, true);
        },
        [editor]
    );

    return (
        <ScrollBlankContainter
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onClick={onClick}
        />
    );
}

const Container = styled('div')(
    ({ isWhiteboard }: { isWhiteboard: boolean }) => ({
        width: '100%',
        height: '100%',
        overflowY: isWhiteboard ? 'unset' : 'auto',
        padding: isWhiteboard ? 0 : '96px 150px 0 150px',
        minWidth: isWhiteboard ? 'unset' : '940px',
    })
);

const Content = styled('div')({
    width: '100%',
    margin: '0 auto',
    transitionDuration: '.2s',
    transitionTimingFunction: 'ease-in',
    position: 'relative',
});

const ScrollBlankContainter = styled('div')({ paddingBottom: '30vh' });
