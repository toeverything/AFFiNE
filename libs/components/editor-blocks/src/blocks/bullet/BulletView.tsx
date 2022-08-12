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
    BlockPendantProvider,
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
export const BulletView = ({ block, editor }: CreateView) => {
    // block.remove();
    const properties = { ...defaultBulletProps, ...block.getProperties() };
    const textRef = useRef<ExtendedTextUtils>(null);
    // const [type, set_type] = useState('type-1');
    const [isSelect, setIsSelect] = useState<boolean>();

    useOnSelect(block.id, (is_select: boolean) => {
        setIsSelect(is_select);
    });
    const turnIntoTextBlock = async () => {
        // Convert to text block
        await block.setType('text');
        await reset_todo_state(block);

        if (!textRef.current) {
            throw new Error(
                'Failed to set cursor position! text_ref is not exist!'
            );
        }
        const currentSelection = textRef.current.getStartSelection();
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
        try {
            const parentBlock = await block.parent();
            if (!parentBlock) {
                return;
            }
            let parentNumberType = parentBlock.getProperty('numberType');
            if (
                !parentNumberType &&
                parentBlock.type === Protocol.Block.Type.bullet
            ) {
                parentNumberType = NumberType.type1;
                parentBlock.setProperty('numberType', parentNumberType);
            }
            block.setProperty('numberType', getChildrenType(parentNumberType));
        } catch (e) {
            console.warn(
                'Failed to update bullet list numbers!',
                'This issue may be related to the undo redo. block:',
                block
            );
            console.warn(e);
        }
    };

    useEffect(() => {
        listChange();
        let obj: any;
        const parentChange = async () => {
            const parentBlock = await block.parent();
            obj = await services.api.editorBlock.observe(
                {
                    workspace: editor.workspace,
                    id: parentBlock.id,
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

    const onTextEnter: TextProps['handleEnter'] = async props => {
        const { splitContents, isShiftKey } = props;
        if (isShiftKey) {
            return false;
        }
        const { contentBeforeSelection, contentAfterSelection } = splitContents;
        const before = [...(contentBeforeSelection.content ?? '')];
        const after = [...(contentAfterSelection.content ?? '')];
        if (todoIsEmpty({ value: before } as ContentColumnValue)) {
            await turnIntoTextBlock();
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
    const onTab: TextProps['handleTab'] = async ({ isShiftKey }) => {
        if (!isShiftKey) {
            const preSiblingBlock = await block.previousSibling();
            if (preSiblingBlock && supportChildren(preSiblingBlock)) {
                const copyBlock = block;
                block.remove();
                block.removeChildren();
                const blockChildren = await copyBlock.children();
                preSiblingBlock.append(copyBlock, ...blockChildren);
            }
            return true;
        } else {
            return tabBlock(block, isShiftKey);
        }
    };

    const onBackspace: TextProps['handleBackSpace'] = async ({
        isCollAndStart,
    }) => {
        if (!isCollAndStart) {
            return false;
        }
        await turnIntoTextBlock();
        return true;
    };

    return (
        <BlockContainer editor={editor} block={block} selected={isSelect}>
            <BlockPendantProvider block={block}>
                <List>
                    <BulletLeft>
                        <BulletIcon numberType={properties.numberType} />
                    </BulletLeft>
                    <div className={'textContainer'}>
                        <TextManage
                            ref={textRef}
                            editor={editor}
                            block={block}
                            supportMarkdown
                            placeholder="/Bullet list"
                            handleEnter={onTextEnter}
                            handleBackSpace={onBackspace}
                            handleTab={onTab}
                        />
                    </div>
                </List>
            </BlockPendantProvider>
            <IndentWrapper>
                <RenderBlockChildren block={block} />
            </IndentWrapper>
        </BlockContainer>
    );
};
