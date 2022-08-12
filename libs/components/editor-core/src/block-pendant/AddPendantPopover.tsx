import React, { CSSProperties, useRef } from 'react';
import { Add } from '@mui/icons-material';
import {
    Popover,
    type PopoverProps,
    PopperHandler,
    Tag,
} from '@toeverything/components/ui';
import { TagsIcon } from '@toeverything/components/icons';

import { CreatePendantPanel } from './pendant-operation-panel';
import { IconButton } from './StyledComponent';
import { AsyncBlock } from '../editor';

type Props = {
    block: AsyncBlock;
    onSure?: () => void;
    iconStyle?: CSSProperties;
    useAddIcon?: boolean;
} & Omit<PopoverProps, 'content'>;
export const AddPendantPopover = ({
    block,
    onSure,
    iconStyle,
    useAddIcon = true,
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
            {useAddIcon ? (
                <IconButton style={{ marginRight: 12, ...iconStyle }}>
                    <Add sx={{ fontSize: 14 }} />
                </IconButton>
            ) : (
                <Tag
                    style={{
                        background: '#F5F7F8',
                        color: '#98ACBD',
                        marginRight: 12,
                        marginBottom: 8,
                    }}
                    startElement={
                        <TagsIcon style={{ fontSize: 14, marginRight: 4 }} />
                    }
                >
                    Tag App
                </Tag>
            )}
        </Popover>
    );
};
