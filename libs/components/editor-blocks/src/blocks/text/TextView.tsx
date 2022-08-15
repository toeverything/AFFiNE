import { useState } from 'react';

import { CustomText, TextProps } from '@toeverything/components/common';
import {
    BlockPendantProvider,
    RenderBlockChildren,
    splitGroup,
    supportChildren,
    useOnSelect,
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
            fontWeight: textStyleMap.text.fontWeight,
        };
    }
});

export const TextView = ({
    block,
    editor,
    containerClassName,
}: CreateTextView) => {
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
        const nextBlockChildren = await block.children();
        const nextBlock = await editor.createBlock('text');
        if (!nextBlock) {
            throw new Error('Failed to create text block');
        }
        await nextBlock.setProperty('text', {
            value: after as CustomText[],
        });
        await block.setProperty('text', {
            value: before as CustomText[],
        });

        if (editor.getRootBlockId() === block.id) {
            // If the block is the root block,
            // new block can not append as next sibling,
            // all new blocks should be append as children.
            await block.insert(0, [nextBlock]);
            editor.selectionManager.activeNodeByNodeId(nextBlock.id);
            return true;
        }
        await nextBlock.append(...nextBlockChildren);
        await block.removeChildren();
        await block.after(nextBlock);

        editor.selectionManager.activeNodeByNodeId(nextBlock.id);
        return true;
    };

    const onBackspace: TextProps['handleBackSpace'] = editor.withBatch(
        async props => {
            const { isCollAndStart } = props;
            if (!isCollAndStart) {
                return false;
            }
            if (block.type !== 'text') {
                await block.setType('text');
                return true;
            }
            if (editor.getRootBlockId() === block.id) {
                // Can not delete
                return false;
            }
            const parentBlock = await block.parent();

            if (!parentBlock) {
                return false;
            }

            const preParent = await parentBlock.previousSibling();
            if (
                Protocol.Block.Type.group === parentBlock.type ||
                editor.getRootBlockId() === parentBlock.id
            ) {
                const children = await block.children();
                const preNode = await block.physicallyPerviousSibling();
                // FIXME support children do not means has textBlock
                // TODO: abstract this part of code
                if (preNode) {
                    if (supportChildren(preNode)) {
                        await editor.selectionManager.activePreviousNode(
                            block.id,
                            'end'
                        );
                        if (
                            block.getProperty('text').value[0] &&
                            block.getProperty('text').value[0]?.text !== ''
                        ) {
                            const value = [
                                ...preNode.getProperty('text').value,
                                ...block.getProperty('text').value,
                            ];
                            await preNode.setProperty('text', {
                                value,
                            });
                        }
                        await preNode.append(...children);
                        await block.remove();
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
                                    [preParent?.id ?? editor.getRootBlockId()]
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
        }
    );

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
            <BlockPendantProvider block={block}>
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
            </BlockPendantProvider>
            <IndentWrapper>
                <RenderBlockChildren block={block} />
            </IndentWrapper>
        </BlockContainer>
    );
};
