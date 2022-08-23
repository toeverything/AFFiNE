import { TextProps } from '@toeverything/components/common';
import {
    AsyncBlock,
    BlockPendantProvider,
    CreateView,
    useOnSelect,
} from '@toeverything/components/editor-core';
import { styled } from '@toeverything/components/ui';
import {
    ContentColumnValue,
    Protocol,
} from '@toeverything/datasource/db-service';
import { useRef, useState } from 'react';
import { BlockContainer } from '../../components/BlockContainer';
import {
    TextManage,
    type ExtendedTextUtils,
} from '../../components/text-manage';
import { tabBlock } from '../../utils/indent';
import { CheckBox } from './CheckBox';
import type { TodoAsyncBlock, TodoProperties } from './types';

export const defaultTodoProps: TodoProperties = {
    text: { value: [{ text: '' }] },
};

const reset_todo_state = async (block: TodoAsyncBlock) => {
    await block.setProperties({
        checked: { value: false },
        collapsed: { value: false },
    });
};

const todoIsEmpty = (contentValue: ContentColumnValue): boolean => {
    const todoValue = contentValue.value;
    return (
        todoValue.length === 0 ||
        (todoValue.length === 1 && !todoValue[0]['text'])
    );
};

export const TodoView = ({ block, editor }: CreateView) => {
    const properties = { ...defaultTodoProps, ...block.getProperties() };
    const text_ref = useRef<ExtendedTextUtils>(null);
    const [isSelect, setIsSelect] = useState<boolean>(false);
    useOnSelect(block.id, (isSelect: boolean) => {
        setIsSelect(isSelect);
    });

    const turn_into_text_block = async () => {
        // Convert to text block
        await block.setType('text');
        await reset_todo_state(block);

        if (!text_ref.current) {
            throw new Error(
                'Failed to set cursor position! text_ref is not exist!'
            );
        }
        const currentSelection = text_ref.current.getCurrentSelection();
        if (!currentSelection) {
            throw new Error(
                'Failed to get cursor selection! currentSelection is not exist!'
            );
        }
        // Update cursor position
        editor.selectionManager.setNodeActiveSelection(block.id, {
            type: 'Range',
            info: currentSelection,
        });
    };

    const on_text_enter: TextProps['handleEnter'] = async props => {
        const { splitContents, isShiftKey } = props;
        if (isShiftKey) {
            return false;
        }
        const { contentBeforeSelection, contentAfterSelection } = splitContents;
        const before = [...contentBeforeSelection.content];
        const after = [...contentAfterSelection.content];
        if (todoIsEmpty({ value: before } as ContentColumnValue)) {
            await turn_into_text_block();
            return true;
        }

        // Move children to new block
        const children = (await block.children()).filter(
            Boolean
        ) as AsyncBlock[];

        const next_node = await editor.createBlock(Protocol.Block.Type.todo);
        if (!next_node) {
            throw new Error('Failed to create todo block');
        }
        await block.removeChildren();
        await next_node.append(...children);
        await next_node.setProperties({
            text: { value: after } as ContentColumnValue,
        });

        await block.setProperties({
            text: { value: before } as ContentColumnValue,
            collapsed: { value: false },
        });
        await block.after(next_node);

        editor.selectionManager.activeNodeByNodeId(next_node.id);

        return true;
    };

    const on_tab: TextProps['handleTab'] = async ({ isShiftKey }) => {
        await tabBlock(editor, block, isShiftKey);
        return true;
    };

    const on_backspace: TextProps['handleBackSpace'] = async ({
        isCollAndStart,
    }) => {
        if (!isCollAndStart) {
            return false;
        }
        await turn_into_text_block();
        return true;
    };

    const on_checked_change = async (checked: boolean) => {
        await block.setProperties({
            checked: { value: checked },
        });
    };

    return (
        <BlockContainer editor={editor} block={block} selected={isSelect}>
            <BlockPendantProvider block={block}>
                <TodoBlock>
                    <div className={'checkBoxContainer'}>
                        <CheckBox
                            checked={properties.checked?.value}
                            onChange={on_checked_change}
                        />
                    </div>

                    <div className={'textContainer'}>
                        <TextManage
                            className={
                                properties.checked?.value ? 'checked' : ''
                            }
                            ref={text_ref}
                            editor={editor}
                            block={block}
                            supportMarkdown
                            placeholder="To-do"
                            handleEnter={on_text_enter}
                            handleBackSpace={on_backspace}
                            handleTab={on_tab}
                        />
                    </div>
                </TodoBlock>
            </BlockPendantProvider>
        </BlockContainer>
    );
};

const TodoBlock = styled('div')({
    display: 'flex',
    '.checkBoxContainer': {
        marginRight: '4px',
        padding: '0 4px',
        height: '22px',
    },
    '.textContainer': {
        flex: 1,
        maxWidth: '100%',
        overflowX: 'hidden',
        overflowY: 'hidden',
    },
    '.checked': {
        color: '#B9CAD5',
    },
});
