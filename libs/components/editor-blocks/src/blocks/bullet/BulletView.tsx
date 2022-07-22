import type { TextProps } from '@toeverything/components/common';
import {
    ContentColumnValue,
    services,
    Protocol,
} from '@toeverything/datasource/db-service';
import { type CreateView } from '@toeverything/framework/virgo';
import { useEffect, useRef, useState, type FC } from 'react';

import {
    TextManage,
    type ExtendedTextUtils,
} from '../../components/text-manage';
import { tabBlock } from '../../utils/indent';
import { BulletBlock, BulletProperties } from './types';
import {
    supportChildren,
    RenderBlockChildren,
    useOnSelect,
    WrapperWithPendantAndDragDrop,
} from '@toeverything/components/editor-core';
import { List } from '../../components/style-container';
import { getChildrenType, BulletIcon, NumberType } from './data';
import { IndentWrapper } from '../../components/IndentWrapper';
import { BlockContainer } from '../../components/BlockContainer';
import { styled } from '@toeverything/components/ui';

export const defaultBulletProps: BulletProperties = {
    text: { value: [{ text: '' }] },
    numberType: NumberType.type1,
};
const reset_todo_state = async (block: BulletBlock) => {
    await block.setProperties({});
};

const todoIsEmpty = (contentValue: ContentColumnValue): boolean => {
    const todoValue = contentValue.value;
    return (
        todoValue.length === 0 ||
        (todoValue.length === 1 && !todoValue[0]['text'])
    );
};
const BulletLeft = styled('div')(() => ({
    height: '22px',
}));
export const BulletView: FC<CreateView> = ({ block, editor }) => {
    // block.remove();
    const properties = { ...defaultBulletProps, ...block.getProperties() };
    const text_ref = useRef<ExtendedTextUtils>(null);
    // const [type, set_type] = useState('type-1');
    const [isSelect, setIsSelect] = useState<boolean>();

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
        const currentSelection = text_ref.current.getStartSelection();
        if (!currentSelection) {
            throw new Error(
                'Failed to get cursor selection! currentSelection is not exist!'
            );
        }
        editor.selectionManager.setNodeActiveSelection(block.id, {
            type: 'Range',
            info: currentSelection,
        });
        // Update cursor position
        // editor.selectionManager.setActivatedNodeId(block.id);
        // editor.selectionManager.setNodeActiveSelection(block.id, {
        //     type: 'Range',
        //     info: currentSelection
        // });
    };
    const i = 0;
    const listChange = async () => {
        const preBlock = await block.previousSiblings();
        const parent_block = await block.parent();
        let parent_number_type = parent_block.getProperty('numberType');
        if (
            !parent_number_type &&
            parent_block.type === Protocol.Block.Type.bullet
        ) {
            parent_number_type = NumberType.type1;
            parent_block.setProperty('numberType', parent_number_type);
        }
        block.setProperty('numberType', getChildrenType(parent_number_type));
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

        const next_node = await editor.createBlock(Protocol.Block.Type.bullet);
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
            return tabBlock(block, isShiftKey);
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
            <WrapperWithPendantAndDragDrop editor={editor} block={block}>
                <List>
                    <BulletLeft>
                        <BulletIcon numberType={properties.numberType} />
                    </BulletLeft>
                    <div className={'textContainer'}>
                        <TextManage
                            ref={text_ref}
                            editor={editor}
                            block={block}
                            supportMarkdown
                            placeholder="/Bullet list"
                            handleEnter={on_text_enter}
                            handleBackSpace={on_backspace}
                            handleTab={on_tab}
                        />
                    </div>
                </List>
            </WrapperWithPendantAndDragDrop>
            <IndentWrapper>
                <RenderBlockChildren block={block} />
            </IndentWrapper>
        </BlockContainer>
    );
};
