import { TextProps } from '@toeverything/components/common';
import {
    ContentColumnValue,
    Protocol,
    services,
} from '@toeverything/datasource/db-service';
import { type CreateView } from '@toeverything/framework/virgo';
import { useEffect, useRef, useState } from 'react';
import {
    TextManage,
    type ExtendedTextUtils,
} from '../../components/text-manage';
import { tabBlock } from '../../utils/indent';
import type { Numbered, NumberedAsyncBlock } from './types';

import {
    BlockPendantProvider,
    RenderBlockChildren,
    supportChildren,
    useOnSelect,
} from '@toeverything/components/editor-core';
import { BlockContainer } from '../../components/BlockContainer';
import { List } from '../../components/style-container';
import { getChildrenType, getNumber } from './data';

export const defaultTodoProps: Numbered = {
    text: { value: [{ text: '' }] },
    numberType: 'type1',
};
const reset_todo_state = async (block: NumberedAsyncBlock) => {
    await block.setProperties({});
};

const todoIsEmpty = (contentValue: ContentColumnValue): boolean => {
    const todoValue = contentValue.value;
    return (
        todoValue.length === 0 ||
        (todoValue.length === 1 && !todoValue[0]['text'])
    );
};

export const NumberedView = ({ block, editor }: CreateView) => {
    // block.remove();
    const properties = { ...defaultTodoProps, ...block.getProperties() };
    const [number, set_number] = useState<number>(1);
    const [isSelect, setIsSelect] = useState<boolean>();

    // const [type, set_type] = useState('type-1');
    const text_ref = useRef<ExtendedTextUtils>(null);

    useOnSelect(block.id, (is_select: boolean) => {
        setIsSelect(is_select);
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
    const i = 0;
    const listChange = async () => {
        let number = 1;
        const preBlock = await block.previousSiblings();
        const parent_block = await block.parent();
        let parent_number_type = 'type3';
        if (parent_block.type === 'numbered') {
            parent_number_type = await parent_block.getProperty('numberType');
        }
        block.setProperty('numberType', getChildrenType(parent_number_type));

        if (preBlock.length) {
            preBlock.reverse();
            for (let i = 0; i <= preBlock.length; i++) {
                if (preBlock[i]?.type === 'numbered') {
                    number++;
                } else {
                    break;
                }
            }
        }
        set_number(number);
    };

    useEffect(() => {
        listChange();
        let obj: any;
        const parentChange = async () => {
            const parent_block = await block.parent();
            obj = await services.api.editorBlock.observe(
                {
                    workspace: editor.workspace,
                    id: parent_block.id,
                },
                listChange
            );
        };
        parentChange();
        return () => {
            obj?.();
        };
        // console.log('_parent_block: ', _parent_block);
    }, []);

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
        const children = await block.children();
        await block.removeChildren();

        const next_node = await editor.createBlock(
            Protocol.Block.Type.numbered
        );
        if (!next_node) {
            throw new Error('Failed to create todo block');
        }
        await next_node.append(...children);
        await next_node.setProperties({
            text: { value: after } as ContentColumnValue,
        });
        await block.setProperties({
            text: { value: before } as ContentColumnValue,
        });
        await block.after(next_node);

        editor.selectionManager.activeNodeByNodeId(next_node.id);

        return true;
    };
    const on_tab: TextProps['handleTab'] = async ({ isShiftKey }) => {
        if (!isShiftKey) {
            const preSiblingBlock = await block.previousSibling();

            if (preSiblingBlock && supportChildren(preSiblingBlock)) {
                const copy_block = block;
                block.remove();
                block.removeChildren();
                const block_children = await copy_block.children();
                preSiblingBlock.append(copy_block, ...block_children);
            }
            return true;
        } else {
            tabBlock(editor, block, isShiftKey);
            return false;
        }
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

    return (
        <BlockContainer editor={editor} block={block} selected={isSelect}>
            <BlockPendantProvider editor={editor} block={block}>
                <List>
                    <div className={'checkBoxContainer'}>
                        {getNumber(properties.numberType, number)}.
                    </div>
                    <div className="textContainer">
                        <TextManage
                            ref={text_ref}
                            editor={editor}
                            block={block}
                            supportMarkdown
                            placeholder="Numbered list"
                            handleEnter={on_text_enter}
                            handleBackSpace={on_backspace}
                            handleTab={on_tab}
                        />
                    </div>
                </List>
            </BlockPendantProvider>

            <RenderBlockChildren block={block} />
        </BlockContainer>
    );
};
