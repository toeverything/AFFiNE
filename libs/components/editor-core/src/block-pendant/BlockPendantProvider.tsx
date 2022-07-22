import type { FC, PropsWithChildren } from 'react';
import React, { useState, useRef } from 'react';
import { styled, Popover } from '@toeverything/components/ui';
import type { AsyncBlock } from '../editor';
import { PendantPopover } from './pendant-popover';
import { PendantRender } from './pendant-render';
/**
 * @deprecated
 */
interface BlockTagProps {
    block: AsyncBlock;
}

/**
 * @deprecated Need to be refactored
 */
export const BlockPendantProvider: FC<PropsWithChildren<BlockTagProps>> = ({
    block,
    children,
}) => {
    const [container, setContainer] = useState<HTMLElement>(null);
    return (
        <Container ref={(dom: HTMLElement) => setContainer(dom)}>
            {children}
            {container && (
                <PendantPopover block={block} container={container}>
                    <TriggerLine className="triggerLine" />
                </PendantPopover>
            )}
            <PendantRender block={block} />
        </Container>
    );
};

const Container = styled('div')({
    position: 'relative',
    padding: '4px',
    '&:hover .triggerLine::after': {
        display: 'flex',
    },
});

const TriggerLine = styled('div')`
    padding: 4px 0;
    width: 100px;
    cursor: default;
    display: flex;
    align-items: flex-end;
    position: relative;
    //background: red;
    ::after {
        content: '';
        width: 100%;
        height: 2px;
        background: #d9d9d9;
        display: none;
        position: absolute;
        left: 0;
        top: 4px;
    }
`;
