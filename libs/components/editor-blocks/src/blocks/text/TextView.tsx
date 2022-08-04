import { FC, useState } from 'react';

import { CustomText, TextProps } from '@toeverything/components/common';
import {
    mergeGroup,
    RenderBlockChildren,
    splitGroup,
    supportChildren,
    unwrapGroup,
    useOnSelect,
    WrapperWithPendantAndDragDrop,
} from '@toeverything/components/editor-core';
import { styled } from '@toeverything/components/ui';
import { Protocol } from '@toeverything/datasource/db-service';
import { CreateView } from '@toeverything/framework/virgo';
import { BlockContainer } from '../../components/BlockContainer';
import { IndentWrapper } from '../../components/IndentWrapper';
import { TextManage } from '../../components/text-manage';
import { tabBlock } from '../../utils/indent';
interface CreateTextView extends CreateView {
    // TODO: need to optimize
    containerClassName?: string;
}

const TextBlock = styled(TextManage)<{ type: string }>(({ theme, type }) => {
    const textStyleMap = {
        text: theme.affine.typography.body1,
        heading1: theme.affine.typography.h1,
        heading2: theme.affine.typography.h2,
        heading3: theme.affine.typography.h3,
        heading4: theme.affine.typography.h4,
        callout: {
            ...theme.affine.typography.body1,
            background: theme.affine.palette.textSelected,
        },
        quote: {
            ...theme.affine.typography.body1,
            borderLeft: `2px solid ${theme.affine.palette.primary}`,
            paddingLeft: theme.affine.spacing.xsSpacing,
        },
    };
    if (type in textStyleMap) {
        const textType = type as keyof typeof textStyleMap;
        return textStyleMap[textType];
    } else {
        return {
            fontSize: textStyleMap.text.fontSize,
            lineHeight: textStyleMap.text.lineHeight,
        };
    }
});

export const TextView: FC<CreateTextView> = ({
    block,
    editor,
    containerClassName,
}) => {
    const [isSelect, setIsSelect] = useState<boolean>();
    useOnSelect(block.id, (is_select: boolean) => {
        setIsSelect(is_select);
    });
    // block.remove();
    const onTextEnter: TextProps['handleEnter'] = async props => {
        const { splitContents, isShiftKey } = props;
        if (isShiftKey || !splitContents) {
            return false;
        }
        const { contentBeforeSelection, contentAfterSelection } = splitContents;
        const before = [...contentBeforeSelection.content];
        const after = [...contentAfterSelection.content];
        const _nextBlockChildren = await block.children();
        const _nextBlock = await editor.createBlock('text');
        await _nextBlock.setProperty('text', {
            value: after as CustomText[],
        });
        _nextBlock.append(..._nextBlockChildren);
        block.removeChildren();
        await block.setProperty('text', {
            value: before as CustomText[],
        });
        await block.after(_nextBlock);

        editor.selectionManager.activeNodeByNodeId(_nextBlock.id);
        return true;
    };

    const onBackspace: TextProps['handleBackSpace'] = async props => {
        return await editor.withSuspend(async () => {
            const { isCollAndStart } = props;
            if (!isCollAndStart) {
                return false;
            }
            if (block.type !== 'text') {
                await block.setType('text');
                return true;
            }
            const parentBlock = await block.parent();

            if (!parentBlock) {
                return false;
            }
            const preParent = await parentBlock.previousSibling();
            if (Protocol.Block.Type.group === parentBlock.type) {
                const children = await block.children();
                const preNode = await block.physicallyPerviousSibling();
                // FIXME support children do not means has textBlock
                // TODO: abstract this part of code
                if (preNode) {
                    if (supportChildren(preNode)) {
                        editor.suspend(true);
                        await editor.selectionManager.activePreviousNode(
                            block.id,
                            'end'
                        );
                        const value = [
                            ...preNode.getProperty('text').value,
                            ...block.getProperty('text').value,
                        ];
                        await preNode.setProperty('text', {
                            value,
                        });
                        await preNode.append(...children);
                        await block.remove();
                        editor.suspend(false);
                    } else {
                        // TODO: point does not clear
                        await editor.selectionManager.activePreviousNode(
                            block.id,
                            'start'
                        );
                        if (block.blockProvider.isEmpty()) {
                            await block.remove();
                            const parentChild = await parentBlock.children();
                            if (
                                parentBlock.type ===
                                    Protocol.Block.Type.group &&
                                !parentChild.length
                            ) {
                                await editor.selectionManager.setSelectedNodesIds(
                                    [preParent.id]
                                );
                            }
                        }
                    }
                    return true;
                }
            }
            if (Protocol.Block.Type.gridItem === parentBlock.type) {
                const siblingBlocks = await parentBlock.children();
                const previousSiblings = await block.previousSiblings();
                const gridBlock = await parentBlock.parent();
                const prevGridItemBlock = await parentBlock.previousSibling();
                const siblingBlocksReverse = [...previousSiblings].reverse();
                const textBlock = siblingBlocksReverse.find(child =>
                    supportChildren(child)
                );
                if (textBlock) {
                    const children = await block.children();
                    const value = [
                        ...textBlock.getProperty('text').value,
                        ...block.getProperty('text').value,
                    ];
                    await textBlock.setProperty('text', {
                        value,
                    });
                    await textBlock.append(...children);
                    await block.remove();
                    await editor.selectionManager.activeNodeByNodeId(
                        textBlock.id
                    );
                } else if (prevGridItemBlock) {
                    await prevGridItemBlock.append(...siblingBlocks);
                    await parentBlock.remove();
                } else {
                    await gridBlock.before(...siblingBlocks);
                    await parentBlock.remove();
                }
                return true;
            } else {
                const nextNodes = await block.nextSiblings();
                for (const nextNode of nextNodes) {
                    await nextNode.remove();
                }
                block.append(...nextNodes);
                editor.commands.blockCommands.moveBlockAfter(
                    block.id,
                    parentBlock.id
                );
            }
            return true;
        });
    };
    const handleConvert = async (
        toType: string,
        options?: Record<string, unknown>
    ) => {
        if (toType === Protocol.Block.Type.groupDivider) {
            splitGroup(editor, block, true);
            return;
        }
        await block.setType(toType as 'title');
        await block.setProperty('text', {
            value: options?.['text'] as CustomText[],
        });
        block.firstCreateFlag = true;
    };
    const onTab: TextProps['handleTab'] = async ({ isShiftKey }) => {
        await tabBlock(block, isShiftKey);
        return true;
    };

    return (
        <BlockContainer
            editor={editor}
            block={block}
            selected={isSelect}
            className={containerClassName}
        >
            <WrapperWithPendantAndDragDrop editor={editor} block={block}>
                <TextBlock
                    block={block}
                    type={block.type}
                    editor={editor}
                    placeholder={"type '/' for commands"}
                    handleEnter={onTextEnter}
                    handleBackSpace={onBackspace}
                    handleConvert={handleConvert}
                    handleTab={onTab}
                />
            </WrapperWithPendantAndDragDrop>
            <IndentWrapper>
                <RenderBlockChildren block={block} />
            </IndentWrapper>
        </BlockContainer>
    );
};
