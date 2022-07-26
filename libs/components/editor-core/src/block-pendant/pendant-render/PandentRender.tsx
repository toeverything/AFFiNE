import React, {useRef, useState} from 'react';
import {AsyncBlock} from '../../editor';
import {
    getRecastItemValue,
    RecastBlockValue,
    RecastMetaProperty,
    useRecastBlockMeta,
} from '../../recast-block';
import {
    MuiZoom,
    Popover,
    PopperHandler,
    styled,
} from '@toeverything/components/ui';
import {PendantTag} from '../PendantTag';
import {
    UpdatePendantPanel
} from '../pendant-operation-panel';
import {AddPendantPopover} from '../AddPendantPopover';

export const PendantRender = ({block}: { block: AsyncBlock }) => {
    const [propertyWithValue, setPropertyWithValue] = useState<{
        value: RecastBlockValue;
        property: RecastMetaProperty;
    }>();
    const popoverHandlerRef = useRef<{ [key: string]: PopperHandler }>({});
    const blockRenderContainerRef = useRef<HTMLDivElement>(null);
    const [showAddBtn, setShowAddBtn] = useState(false);

    const {getProperties} = useRecastBlockMeta();

    const {
        getValue,
        removeValue
    } = getRecastItemValue(block);

    const properties = getProperties();

    const propertyWithValues = properties
        .map(property => {
            return {
                value: getValue(property.id),
                property,
            };
        })
        .filter(v => v.value);

    return (
        <BlockPendantContainer
            ref={blockRenderContainerRef}
            onPointerEnter={() => {
                setShowAddBtn(true);
            }}
            onPointerLeave={() => {
                setShowAddBtn(false);
            }}
        >
            {propertyWithValues.map(pWithV => {
                const {id, type} = pWithV.value;

                /* （暂时关闭，HOOK中需要加入Scene的判断）Remove duplicate label(tag) */
                // if (groupBy?.id === id) {
                //     return null;
                // }

                return (
                    <Popover
                        ref={ref => {
                            popoverHandlerRef.current[id] = ref;
                        }}
                        container={blockRenderContainerRef.current}
                        key={id}
                        trigger="click"
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
                                            id
                                        ].setVisible(false);
                                    }}
                                    onCancel={() => {
                                        popoverHandlerRef.current[
                                            id
                                        ].setVisible(false);
                                    }}
                                />
                            )
                        }
                    >
                        <PendantTag
                            key={id}
                            style={{
                                marginRight: 10,
                                marginTop: 4,
                            }}
                            onClick={e => {
                                setPropertyWithValue(pWithV);
                            }}
                            value={pWithV.value}
                            property={pWithV.property}
                            closeable
                            onClose={async () => {
                                await removeValue(pWithV.property.id);
                            }}
                        />
                    </Popover>
                );
            })}
            {propertyWithValues.length ? (
                <MuiZoom in={showAddBtn}>
                    <div>
                        <AddPendantPopover
                            block={block}
                            iconStyle={{marginTop: 4}}
                            container={blockRenderContainerRef.current}
                        />
                    </div>
                </MuiZoom>
            ) : null}
        </BlockPendantContainer>
    );
};

const BlockPendantContainer = styled('div')`
    display: flex;
    flex-wrap: wrap;
`;
