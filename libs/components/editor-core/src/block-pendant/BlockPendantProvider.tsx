import type { FC, PropsWithChildren } from 'react';
import React, { useState } from 'react';
import { styled } from '@toeverything/components/ui';
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
    const [isHover, setIsHover] = useState(false);
    return (
        <Container ref={(dom: HTMLElement) => setContainer(dom)}>
            {children}
            {container && (
                <PendantPopover
                    block={block}
                    container={container}
                    onVisibleChange={visible => {
                        setIsHover(visible);
                    }}
                >
                    <StyledTriggerLine
                        className="triggerLine"
                        isHover={isHover}
                    />
                </PendantPopover>
            )}
            <PendantRender block={block} />
        </Container>
    );
};

const Container = styled('div')({
    position: 'relative',
    padding: '4px',
    '&:hover .triggerLine::before': {
        display: 'flex',
    },
});

const StyledTriggerLine = styled('div')<{ isHover: boolean }>(({ isHover }) => {
    return {
        padding: '4px 0',
        width: '100px',
        cursor: 'default',
        display: 'flex',
        alignItems: 'flex-end',
        position: 'relative',

        '::before': {
            content: "''",
            width: '100%',
            height: '2px',
            background: '#dadada',
            display: 'none',
            position: 'absolute',
            left: '0',
            top: '4px',
        },
        '::after': {
            content: "''",
            width: isHover ? '100%' : '0',
            height: '2px',
            background: '#aac4d5',
            display: 'block',
            position: 'absolute',
            left: '0',
            top: '4px',
            transition: 'width .3s',
        },
    };
});
