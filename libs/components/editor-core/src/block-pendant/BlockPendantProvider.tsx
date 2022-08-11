import type { FC, PropsWithChildren } from 'react';
import { styled } from '@toeverything/components/ui';
import type { AsyncBlock } from '../editor';
import { PendantPopover } from './pendant-popover';
import { PendantRender } from './pendant-render';
import { useRef } from 'react';
/**
 * @deprecated
 */
interface BlockTagProps {
    block: AsyncBlock;
}

export const BlockPendantProvider: FC<PropsWithChildren<BlockTagProps>> = ({
    block,
    children,
}) => {
    const triggerRef = useRef<HTMLDivElement>();
    return (
        <Container>
            {children}

            <StyledPendantContainer ref={triggerRef}>
                <PendantPopover block={block} container={triggerRef.current}>
                    <StyledTriggerLine />
                </PendantPopover>
            </StyledPendantContainer>

            <PendantRender block={block} />
        </Container>
    );
};

export const LINE_GAP = 16;
const TAG_GAP = 4;

const StyledTriggerLine = styled('div')({
    padding: `${TAG_GAP}px 0`,
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
        display: 'flex',
        position: 'absolute',
        left: '0',
        top: '4px',
        transition: 'opacity .2s',
        opacity: '0',
    },
    '::after': {
        content: "''",
        width: '0',
        height: '2px',
        background: '#aac4d5',
        display: 'block',
        position: 'absolute',
        left: '0',
        top: '4px',
        transition: 'width .3s',
    },
});
const StyledPendantContainer = styled('div')({
    width: '100px',
    '&:hover': {
        [`${StyledTriggerLine}`]: {
            '&::after': {
                width: '100%',
            },
        },
    },
});
const Container = styled('div')({
    position: 'relative',
    paddingBottom: `${LINE_GAP - TAG_GAP * 2}px`,
    '&:hover': {
        [`${StyledTriggerLine}`]: {
            '&::before': {
                opacity: '1',
            },
        },
    },
});
