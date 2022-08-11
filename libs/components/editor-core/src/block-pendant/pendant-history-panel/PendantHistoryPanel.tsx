import React, { ReactNode, useRef, useEffect, useState } from 'react';
import {
    getRecastItemValue,
    RecastMetaProperty,
    useRecastBlock,
    useRecastBlockMeta,
    RecastBlockValue,
    RecastPropertyId,
} from '../../recast-block';
import { AsyncBlock } from '../../editor';
import { Popover, PopperHandler, styled } from '@toeverything/components/ui';
import { PendantTag } from '../PendantTag';
import { UpdatePendantPanel } from '../pendant-operation-panel';

export const PendantHistoryPanel = ({
    block,
    endElement,
    onClose,
}: {
    block: AsyncBlock;
    endElement?: ReactNode;
    onClose?: () => void;
}) => {
    const groupBlock = useRecastBlock();
    const { getProperties } = useRecastBlockMeta();
    const { getProperty } = useRecastBlockMeta();

    const recastBlock = useRecastBlock();

    const [history, setHistory] = useState<RecastBlockValue[]>([]);
    const popoverHandlerRef = useRef<{ [key: string]: PopperHandler }>({});
    const historyPanelRef = useRef<HTMLDivElement>();
    const { getValueHistory } = getRecastItemValue(block);

    useEffect(() => {
        const init = async () => {
            const currentBlockValues = getRecastItemValue(block).getAllValue();
            const missValues = getProperties().filter(
                property => !currentBlockValues.find(v => v.id === property.id)
            );
            const valueHistory = getValueHistory({
                recastBlockId: recastBlock.id,
            });
            const historyMap = missValues.reduce<{
                [key: RecastPropertyId]: string[];
            }>((history, property) => {
                if (valueHistory[property.id]) {
                    history[property.id] = valueHistory[property.id];
                }

                return history;
            }, {});

            const blockHistory = (
                await Promise.all(
                    Object.entries(historyMap).map(
                        async ([propertyId, blockIds]) => {
                            const blocks = await groupBlock.children();
                            const latestChangeBlock = blockIds
                                .reverse()
                                .reduce<AsyncBlock>((block, id) => {
                                    if (!block) {
                                        return blocks.find(
                                            block => block.id === id
                                        );
                                    }
                                    return block;
                                }, null);

                            if (latestChangeBlock) {
                                return getRecastItemValue(
                                    latestChangeBlock
                                ).getValue(propertyId as RecastPropertyId);
                            }
                            return null;
                        }
                    )
                )
            ).filter(v => v);

            setHistory(blockHistory);
        };

        init();
    }, [block, getProperties, groupBlock, recastBlock]);

    return (
        <StyledPendantHistoryPanel ref={historyPanelRef}>
            {history.map(item => {
                const property = getProperty(item.id);
                return (
                    <Popover
                        key={item.id}
                        ref={ref => {
                            popoverHandlerRef.current[item.id] = ref;
                        }}
                        placement="bottom-start"
                        content={
                            <UpdatePendantPanel
                                block={block}
                                value={item}
                                property={property}
                                hasDelete={false}
                                onSure={() => {
                                    popoverHandlerRef.current[
                                        item.id
                                    ].setVisible(false);
                                    onClose?.();
                                }}
                                onCancel={() => {
                                    popoverHandlerRef.current[
                                        item.id
                                    ].setVisible(false);
                                    onClose?.();
                                }}
                                titleEditable={false}
                            />
                        }
                        trigger="click"
                        container={historyPanelRef.current}
                    >
                        <PendantTag
                            style={{
                                background: '#F5F7F8',
                                color: '#98ACBD',
                                marginRight: 12,
                                marginBottom: 8,
                            }}
                            property={property as RecastMetaProperty}
                            value={item}
                        />
                    </Popover>
                );
            })}
            {endElement}
        </StyledPendantHistoryPanel>
    );
};

const StyledPendantHistoryPanel = styled('div')`
    display: flex;
    flex-wrap: wrap;
`;
