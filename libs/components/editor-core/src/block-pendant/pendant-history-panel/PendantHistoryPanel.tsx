import React, { ReactNode, useRef, useState } from 'react';
import { getLatestPropertyValue } from '../utils';
import {
    getRecastItemValue,
    RecastMetaProperty,
    useRecastBlock,
    useRecastBlockMeta,
    RecastBlockValue,
} from '../../recast-block';
import { AsyncBlock } from '../../editor';
import { Popover, PopperHandler, styled } from '@toeverything/components/ui';
import { PendantTag } from '../PendantTag';
import { UpdatePendantPanel } from '../pendant-operation-panel';

export const PendantHistoryPanel = ({
    block,
    endElement,
}: {
    block: AsyncBlock;
    endElement?: ReactNode;
}) => {
    const [propertyWithValue, setPropertyWithValue] = useState<{
        value: RecastBlockValue;
        property: RecastMetaProperty;
    }>();
    const popoverHandlerRef = useRef<{ [key: string]: PopperHandler }>({});

    const { getProperty } = useRecastBlockMeta();

    const { getAllValue } = getRecastItemValue(block);

    const recastBlock = useRecastBlock();

    const latestPropertyValues = getLatestPropertyValue({
        recastBlockId: recastBlock.id,
        blockId: block.id,
    });
    const blockValues = getAllValue();

    const history = latestPropertyValues
        .filter(latest => !blockValues.find(v => v && v.id === latest.value.id))
        .map(v => v.value);

    return (
        <StyledPendantHistoryPanel>
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
                            propertyWithValue && (
                                <UpdatePendantPanel
                                    block={block}
                                    value={propertyWithValue.value}
                                    property={propertyWithValue.property}
                                    hasDelete={false}
                                    onSure={() => {
                                        popoverHandlerRef.current[
                                            item.id
                                        ].setVisible(false);
                                    }}
                                    onCancel={() => {
                                        popoverHandlerRef.current[
                                            item.id
                                        ].setVisible(false);
                                    }}
                                    titleEditable={false}
                                />
                            )
                        }
                        trigger="click"
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
                            onClick={e => {
                                if (property) {
                                    setPropertyWithValue({
                                        property,
                                        value: item,
                                    });
                                }
                            }}
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
