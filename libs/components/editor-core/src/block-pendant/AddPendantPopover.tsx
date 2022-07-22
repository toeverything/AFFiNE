import React, { CSSProperties, useRef } from 'react';
import { Add } from '@mui/icons-material';
import {
    Popover,
    type PopoverProps,
    PopperHandler,
} from '@toeverything/components/ui';
import { CreatePendantPanel } from './pendant-operation-panel';
import { IconButton } from './StyledComponent';
import { AsyncBlock } from '../editor';

type Props = {
    block: AsyncBlock;
    onSure?: () => void;
    iconStyle?: CSSProperties;
} & Omit<PopoverProps, 'content'>;
export const AddPendantPopover = ({
    block,
    onSure,
    iconStyle,
    ...popoverProps
}: Props) => {
    const popoverHandlerRef = useRef<PopperHandler>();
    return (
        <Popover
            ref={popoverHandlerRef}
            content={
                <CreatePendantPanel
                    block={block}
                    onSure={() => {
                        popoverHandlerRef.current?.setVisible(false);
                        onSure?.();
                    }}
                />
            }
            placement="bottom-start"
            // visible={true}
            style={{ padding: 0 }}
            {...popoverProps}
        >
            <IconButton style={{ marginRight: 12, ...iconStyle }}>
                <Add sx={{ fontSize: 14 }} />
            </IconButton>
        </Popover>
    );
};
