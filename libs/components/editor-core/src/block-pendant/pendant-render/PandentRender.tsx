import {
    MuiFade,
    Popover,
    PopperHandler,
    styled,
} from '@toeverything/components/ui';
import { useRef, useState } from 'react';
import { AsyncBlock } from '../../editor';
import {
    getRecastItemValue,
    RecastScene,
    useCurrentView,
    useRecastBlockMeta,
} from '../../recast-block';
import { AddPendantPopover } from '../AddPendantPopover';
import { UpdatePendantPanel } from '../pendant-operation-panel';
import { PendantTag } from '../PendantTag';

export const PendantRender = ({ block }: { block: AsyncBlock }) => {
    const popoverHandlerRef = useRef<{ [key: string]: PopperHandler }>({});
    const blockRenderContainerRef = useRef<HTMLDivElement>(null);
    const [showAddBtn, setShowAddBtn] = useState(false);

    const { getProperties } = useRecastBlockMeta();
    const [currentView] = useCurrentView();
    const isKanbanView = currentView.type === RecastScene.Kanban;
    const { getValue, removeValue } = getRecastItemValue(block);

    const properties = getProperties();

    const hasAddBtn = properties.some(property => getValue(property.id));

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
            {properties.map(property => {
                const value = getValue(property.id);

                if (!value) {
                    return null;
                }

                // Hide the groupBy pendant at kanban view
                if (isKanbanView && currentView.groupBy === property.id) {
                    return null;
                }

                const { id } = value;

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
                            <UpdatePendantPanel
                                block={block}
                                value={value}
                                property={property}
                                hasDelete={false}
                                onSure={() => {
                                    popoverHandlerRef?.current[id].setVisible(
                                        false
                                    );
                                }}
                                onCancel={() => {
                                    popoverHandlerRef?.current[id].setVisible(
                                        false
                                    );
                                }}
                                titleEditable={true}
                            />
                        }
                    >
                        <PendantTag
                            key={id}
                            style={{
                                marginRight: 10,
                                marginTop: 4,
                            }}
                            value={value}
                            property={property}
                            closeable
                            onClose={async () => {
                                await removeValue(property.id);
                            }}
                        />
                    </Popover>
                );
            })}
            {hasAddBtn ? (
                <MuiFade in={showAddBtn}>
                    <div>
                        <AddPendantPopover
                            block={block}
                            iconStyle={{ marginTop: 4 }}
                            trigger="click"
                            // trigger={isKanbanView ? 'hover' : 'click'}
                            container={blockRenderContainerRef.current}
                        />
                    </div>
                </MuiFade>
            ) : null}
        </BlockPendantContainer>
    );
};

const BlockPendantContainer = styled('div')`
    display: flex;
    flex-wrap: wrap;
`;
