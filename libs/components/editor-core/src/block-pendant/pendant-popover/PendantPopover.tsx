import React, { FC, useRef } from 'react';
import { AsyncBlock } from '../../editor';
import { PendantHistoryPanel } from '../pendant-history-panel';
import {
    Popover,
    type PopperHandler,
    PopperProps,
} from '@toeverything/components/ui';
import { AddPendantPopover } from '../AddPendantPopover';

export const PendantPopover: FC<
    {
        block: AsyncBlock;
    } & Omit<PopperProps, 'content'>
> = props => {
    const { block, ...popoverProps } = props;
    const popoverHandlerRef = useRef<PopperHandler>();
    return (
        <Popover
            ref={popoverHandlerRef}
            pointerEnterDelay={300}
            pointerLeaveDelay={200}
            placement="bottom-start"
            // visible={true}
            // trigger="click"
            content={
                <PendantHistoryPanel
                    block={block}
                    endElement={
                        <AddPendantPopover
                            block={block}
                            onSure={() => {
                                popoverHandlerRef.current?.setVisible(false);
                            }}
                            offset={[0, -30]}
                            trigger="click"
                        />
                    }
                />
            }
            offset={[0, 0]}
            style={popoverContainerStyle}
            {...popoverProps}
        />
    );
};

const popoverContainerStyle = {
    padding: '8px 0 0 12px',
    maxWidth: '700px',
    minHeight: '36px',
    BoxSizing: 'border-box',
};
