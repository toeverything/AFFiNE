/* eslint-disable max-lines */
import {
    Text,
    type SlateUtils,
    type TextProps,
} from '@toeverything/components/common';
import {
    useOnSelectActive,
    useOnSelectSetSelection,
} from '@toeverything/components/editor-core';
import { styled } from '@toeverything/components/ui';
import { ContentColumnValue } from '@toeverything/datasource/db-service';
import {
    AsyncBlock,
    BlockEditor,
    CursorTypes,
} from '@toeverything/framework/virgo';
import { isEqual, Point } from '@toeverything/utils';
import {
    forwardRef,
    MouseEvent,
    useCallback,
    useEffect,
    useRef,
    type MutableRefObject,
} from 'react';
import { Range } from 'slate';
import { ReactEditor } from 'slate-react';

interface CreateTextView extends TextProps {
    // TODO: need to optimize
    block: AsyncBlock;
    editor: BlockEditor;
    className?: string;
}

export type ExtendedTextUtils = SlateUtils & {
    setLinkModalVisible: (visible: boolean) => void;
};
const TextBlockContainer = styled(Text)(({ theme }) => ({
    lineHeight: theme.affine.typography.body1.lineHeight,
}));

const findSlice = (arr: string[], p: string, q: string) => {
    let should_include = false;
    return arr.filter(block => {
        if (block === p || block === q) {
            should_include = !should_include;
            return true;
        } else {
            return should_include;
        }
    });
};

const findLowestCommonAncestor = async (
    editor: BlockEditor,
    p: string,
    q: string
) => {
    const root = editor.getRootBlockId();

    const ancestor: { id: string; children: string[] }[] = [
        { id: p, children: [] },
    ];

    let current = p;

    while (current !== root) {
        const parent = await (await editor.getBlockById(current)).parent();
        ancestor.push({ id: parent.id, children: parent.childrenIds });
        current = parent.id;
    }
    current = q;
    let prev = q;
    let commonAncestor = ancestor.length - 1;
    while (current !== root) {
        // eslint-disable-next-line no-loop-func
        const same = ancestor.findIndex(a => a.id === current);
        if (same !== -1) {
            commonAncestor = same;
            break;
        }
        const parent = await (await editor.getBlockById(current)).parent();
        prev = current;
        current = parent.id;
    }

    // ancestor is p
    if (commonAncestor === 0) {
        return [p];
    }

    // ancestor is q
    if (current === q) {
        return [q];
    }

    return findSlice(
        ancestor[commonAncestor].children,
        prev,
        ancestor[commonAncestor - 1].id
    );
};

export const TextManage = forwardRef<ExtendedTextUtils, CreateTextView>(
    (props, ref) => {
        const { block, editor, ...otherOptions } = props;
        const defaultRef = useRef<ExtendedTextUtils>(null);
        // Maybe there is a better way
        const textRef =
            (ref as MutableRefObject<ExtendedTextUtils>) || defaultRef;

        const properties = block.getProperties();
        // const [is_select, set_is_select] = useState<boolean>();
        // useOnSelect(block.id, (is_select: boolean) => {
        //     set_is_select(is_select);
        // });
        const on_text_view_set_selection = (selection: Range | Point) => {
            if (selection instanceof Point) {
                //do some thing
            } else {
                textRef.current.setSelection(selection);
            }
        };

        // block = await editor.commands.blockCommands.createNextBlock(block.id,)
        const on_text_view_active = useCallback(
            (point: CursorTypes, rang_form?: 'up' | 'down') => {
                // TODO code to be optimized
                if (textRef.current) {
                    const end_selection = textRef.current.getEndSelection();
                    const start_selection = textRef.current.getStartSelection();
                    if (point === 'start') {
                        textRef.current.setSelection(start_selection);
                        return;
                    }
                    if (point === 'end') {
                        textRef.current.setSelection(end_selection);
                        return;
                    }
                    try {
                        if (point instanceof Point) {
                            let blockTop = point.y;
                            const blockDomStyle = block?.dom
                                .getElementsByClassName('text-paragraph')[0]
                                .getBoundingClientRect();

                            if (blockTop > blockDomStyle.top) {
                                blockTop = blockDomStyle.bottom - 5;
                            } else {
                                blockTop = blockDomStyle.top + 5;
                            }
                            const end_position = ReactEditor.toDOMRange(
                                textRef.current.editor,
                                end_selection
                            )
                                .getClientRects()
                                .item(0);
                            const start_position = ReactEditor.toDOMRange(
                                textRef.current.editor,
                                start_selection
                            )
                                .getClientRects()
                                .item(0);
                            if (end_position.left <= point.x) {
                                textRef.current.setSelection(end_selection);
                                return;
                            }
                            if (start_position.left >= point.x) {
                                textRef.current.setSelection(start_selection);
                                return;
                            }
                            let range: globalThis.Range;
                            if (document.caretRangeFromPoint) {
                                range = document.caretRangeFromPoint(
                                    point.x,
                                    blockTop
                                );
                            } else if (document.caretPositionFromPoint) {
                                const caret = document.caretPositionFromPoint(
                                    point.x,
                                    blockTop
                                );

                                range = document.createRange();
                                range.setStart(caret.offsetNode, caret.offset);
                            }
                            const slate_rang = ReactEditor.toSlateRange(
                                textRef.current.editor,
                                range,
                                {
                                    exactMatch: true,
                                    suppressThrow: true,
                                }
                            );
                            textRef.current.setSelection(slate_rang);
                        }
                    } catch (e) {
                        console.log('e: ', e);
                        textRef.current.setSelection(end_selection);
                    }
                }
            },
            [textRef]
        );

        useOnSelectActive(block.id, on_text_view_active);
        useOnSelectSetSelection<'Range'>(block.id, on_text_view_set_selection);

        useEffect(() => {
            if (textRef.current) {
                editor.blockHelper.registerTextUtils(block.id, textRef.current);

                return () => editor.blockHelper.unRegisterTextUtils(block.id);
            }
            return undefined;
        }, [textRef, block, editor.blockHelper]);

        // set active in initialization
        useEffect(() => {
            try {
                const activatedNodeId =
                    editor.selectionManager.getActivatedNodeId();
                const {
                    nodeId: lastSelectNodeId,
                    type,
                    info,
                } = editor.selectionManager.getLastActiveSelectionSetting<'Range'>();
                if (block.id === activatedNodeId) {
                    if (
                        (block.id === lastSelectNodeId && type === 'Range') ||
                        (type === 'Range' && info)
                    ) {
                        on_text_view_active('end');
                    } else {
                        on_text_view_active('start');
                    }
                }
            } catch (e) {
                console.warn('error occured in set active in initialization');
            }
        }, [block.id, editor.selectionManager, on_text_view_active, textRef]);

        const on_text_change: TextProps['handleChange'] = async (
            value,
            textStyle
        ) => {
            if (
                !isEqual(value, properties.text.value) ||
                //@ts-ignore
                (properties.textStyle &&
                    !isEqual(
                        //@ts-ignore
                        textStyle.textAlign,
                        //@ts-ignore
                        properties.textStyle.textAlign
                    ))
            ) {
                await block.setProperties({
                    text: { value } as ContentColumnValue,
                    textStyle: textStyle as Record<'textAlign', string>,
                });
            }
        };
        const get_now_and_pre_rang_position = () => {
            window.getSelection().getRangeAt(0);
            // const now_range =
            //     editor.selectionManager.currentSelectInfo?.browserSelection.getRangeAt(
            //         0
            //     );
            const now_range = window.getSelection().getRangeAt(0);
            let pre_position = null;
            const now_position = now_range.getClientRects().item(0);
            try {
                if (now_range.startOffset !== 0) {
                    const pre_rang = document.createRange();
                    pre_rang.setStart(
                        now_range.startContainer,
                        now_range.startOffset + 1
                    );
                    pre_rang.setEnd(
                        now_range.endContainer,
                        now_range.endOffset + 1
                    );
                    pre_position = pre_rang.getClientRects().item(0);
                }
            } catch (e) {
                // console.log(e);
            }
            return { nowPosition: now_position, prePosition: pre_position };
        };

        const onKeyboardUp = (event: React.KeyboardEvent<Element>) => {
            // if default event is prevented do noting
            // if U want to disable up/down/enter use capture event for preventing
            if (!event.isDefaultPrevented()) {
                const positions = get_now_and_pre_rang_position();
                const prePosition = positions.prePosition;
                const nowPosition = positions.nowPosition;
                if (prePosition) {
                    if (prePosition.top !== nowPosition.top) {
                        return false;
                    }
                }
                // Create the first element range of slate_editor
                const startPoint = textRef.current.getStart();

                const startSlateRange: Range = {
                    anchor: startPoint,
                    focus: startPoint,
                };
                const startPosition = ReactEditor.toDOMRange(
                    textRef.current.editor,
                    startSlateRange
                )
                    .getClientRects()
                    .item(0);
                if (nowPosition.top === startPosition.top) {
                    editor.selectionManager.activePreviousNode(
                        block.id,
                        new Point(nowPosition.left, nowPosition.top)
                    );

                    return true;
                } else {
                    return false;
                }
            }
            return false;
        };

        const onKeyboardDown = (event: React.KeyboardEvent<Element>) => {
            // if default event is prevented do noting
            // if U want to disable up/down/enter use capture event for preventing
            // editor.selectionManager.activeNextNode(block.id, 'start');
            // return;
            if (!event.isDefaultPrevented()) {
                const positions = get_now_and_pre_rang_position();
                const prePosition = positions.prePosition;
                const nowPosition = positions.nowPosition;
                // Create the last element range of slate_editor
                const endPoint = textRef.current.getEnd();

                const endSlateRange: Range = {
                    anchor: endPoint,
                    focus: endPoint,
                };
                const endPosition = ReactEditor.toDOMRange(
                    textRef.current.editor,
                    endSlateRange
                )
                    .getClientRects()
                    .item(0);

                if (nowPosition.bottom === endPosition.bottom) {
                    // The specific amount of TODO needs to be determined after subsequent padding
                    editor.selectionManager.activeNextNode(
                        block.id,
                        new Point(nowPosition.left, nowPosition.bottom)
                    );
                    return true;
                } else {
                    if (prePosition?.bottom === endPosition.bottom) {
                        editor.selectionManager.activeNextNode(
                            block.id,
                            new Point(prePosition.left, prePosition?.bottom)
                        );
                        return true;
                    } else {
                        return false;
                    }
                }
            }
            return false;
        };
        const onKeyboardLeft = () => {
            const isEndText = textRef.current.isStart();
            if (isEndText) {
                editor.selectionManager.activePreviousNode(block.id, 'end');
                return true;
            } else {
                return false;
            }
        };
        const onKeyboardRight = () => {
            const isEndText = textRef.current.isEnd();
            if (isEndText) {
                editor.selectionManager.activeNextNode(block.id, 'start');
                return true;
            } else {
                return false;
            }
        };
        const on_select_all = () => {
            const isSelectAll =
                textRef.current.isEmpty() || textRef.current.isSelectAll();
            if (isSelectAll) {
                editor.selectionManager.selectAllBlocks();
                return true;
            }
            return false;
        };

        const on_undo = () => {
            editor.undo();
        };

        const on_redo = () => {
            editor.redo();
        };

        const on_keyboard_esc = () => {
            if (editor.selectionManager.getSelectedNodesIds().length === 0) {
                const active_node_id =
                    editor.selectionManager.getActivatedNodeId();
                if (active_node_id) {
                    editor.selectionManager.setSelectedNodesIds([
                        active_node_id,
                    ]);
                    ReactEditor.blur(textRef.current.editor);
                }
            } else {
                editor.selectionManager.setSelectedNodesIds([]);
            }
        };

        const on_shift_click = async (e: MouseEvent) => {
            if (e.shiftKey) {
                const activeId = editor.selectionManager.getActivatedNodeId();
                if (activeId === block.id) {
                    return;
                }
                const currentId = block.id;
                const parent = await block.parent();
                if (!parent) {
                    return;
                }
                const position = parent.findChildIndex(block.id);
                if (position === -1) {
                    return;
                }
                e.preventDefault();
                const activeBlock = await editor.getBlockById(activeId);
                const activeParent = await activeBlock.parent();
                if (activeParent === parent) {
                    const sibilings = findSlice(
                        parent.childrenIds,
                        currentId,
                        activeId
                    );
                    editor.blockHelper.blur(activeId);
                    editor.selectionManager.setSelectedNodesIds(sibilings);
                } else {
                    const ids = await findLowestCommonAncestor(
                        editor,
                        currentId,
                        activeId
                    );

                    editor.blockHelper.blur(activeId);
                    editor.selectionManager.setSelectedNodesIds(ids);
                }
            }
        };
        if (!properties || !properties.text) {
            return <></>;
        }

        return (
            <TextBlockContainer
                ref={textRef}
                supportMarkdown
                className={`${otherOptions.className}`}
                currentValue={properties.text.value}
                textStyle={properties.textStyle}
                handleChange={on_text_change}
                handleUp={onKeyboardUp}
                handleDown={onKeyboardDown}
                handleLeft={onKeyboardLeft}
                handleRight={onKeyboardRight}
                handleSelectAll={on_select_all}
                handleMouseDown={on_shift_click}
                handleUndo={on_undo}
                handleRedo={on_redo}
                handleEsc={on_keyboard_esc}
                {...otherOptions}
            />
        );
    }
);

declare global {
    interface Document {
        /**
         *
         * The caretRangeFromPoint() method of the Document interface returns a Range object for the document fragment under the specified coordinates.
         *
         * Non-standard: This feature is non-standard and is not on a standards track. Do not use it on production sites facing the Web: it will not work for every user. There may also be large incompatibilities between implementations and the behavior may change in the future.
         * @memberof Document
         */
        caretPositionFromPoint?: (
            clientX: number,
            clientY: number
        ) => CaretPosition;
    }

    interface CaretPosition {
        offsetNode: Node;
        offset: number;
    }
}
