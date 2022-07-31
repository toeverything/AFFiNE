import type { BlockEditor } from './editor';
import { Point } from '@toeverything/utils';
import { styled, usePatchNodes } from '@toeverything/components/ui';
import type { FC, PropsWithChildren } from 'react';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { RootContext } from './contexts';
import { SelectionRect, SelectionRef } from './Selection';
import {
    Protocol,
    services,
    type ReturnUnobserve,
} from '@toeverything/datasource/db-service';
import { addNewGroup } from './recast-block';
import { useIsOnDrag } from './hooks';

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
    const selectionRef = useRef<SelectionRef>(null);
    const triggeredBySelect = useRef(false);
    const [pageWidth, setPageWidth] = useState<number>(MIN_PAGE_WIDTH);
    const isOnDrag = useIsOnDrag(editor);

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
        editor.getHooks().onRootNodeMouseMove(event);

        const slidingBlock = await editor.getBlockByPoint(
            new Point(event.clientX, event.clientY)
        );

        if (slidingBlock && slidingBlock.dom) {
            editor.getHooks().afterOnNodeMouseMove(event, {
                blockId: slidingBlock.id,
                dom: slidingBlock.dom,
                rect: slidingBlock.dom.getBoundingClientRect(),
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
        event.dataTransfer.dropEffect = 'move';
        event.preventDefault();
        editor.dragDropManager.handlerEditorDragOver(event);
        if (editor.dragDropManager.isEnabled()) {
            editor.getHooks().onRootNodeDragOver(event);
        }
    };

    const onDragOverCapture = (event: React.DragEvent<Element>) => {
        event.preventDefault();
        if (editor.dragDropManager.isEnabled()) {
            editor.getHooks().onRootNodeDragOver(event);
        }
    };

    const onDragEnd = (event: React.DragEvent<Element>) => {
        editor.dragDropManager.handlerEditorDragEnd(event);
        editor.getHooks().onRootNodeDragEnd(event);
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
                    if (ref != null && ref !== editor.container) {
                        editor.container = ref;
                        editor.getHooks().render();
                    }
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
                isOnDrag={isOnDrag}
            >
                <Content style={{ maxWidth: pageWidth + 'px' }}>
                    {children}
                </Content>
                {/** TODO: remove selectionManager insert */}
                {editor && <SelectionRect ref={selectionRef} editor={editor} />}
                {editor.isWhiteboard ? null : <ScrollBlank editor={editor} />}
                {patchedNodes}
            </Container>
        </RootContext.Provider>
    );
};

// eslint-disable-next-line @typescript-eslint/naming-convention
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

const PADDING_X = 150;

const Container = styled('div')(
    ({
        isWhiteboard,
        isOnDrag,
    }: {
        isWhiteboard: boolean;
        isOnDrag: boolean;
    }) => ({
        width: '100%',
        padding: isWhiteboard ? 0 : `72px ${PADDING_X}px 0 ${PADDING_X}px`,
        minWidth: isWhiteboard ? 'unset' : '940px',
        position: 'relative',
        ...(isOnDrag && {
            cursor: 'grabbing',
            // expected css selector
            // eslint-disable-next-line @typescript-eslint/naming-convention
            '& *': { cursor: 'grabbing' },
        }),
    })
);

const Content = styled('div')({
    width: '100%',
    margin: '0 auto',
    transitionDuration: '.2s',
    transitionTimingFunction: 'ease-in',
});

const ScrollBlankContainter = styled('div')({
    paddingBottom: '30vh',
    margin: `0 -${PADDING_X}px`,
});
