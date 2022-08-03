import type { FC, PropsWithChildren } from 'react';
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

export const BlockPendantProvider: FC<PropsWithChildren<BlockTagProps>> = ({
    block,
    children,
}) => {
    return (
        <Container>
            {children}

            <PendantPopover block={block}>
                <StyledTriggerLine />
            </PendantPopover>

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
        display: 'none',
        position: 'absolute',
        left: '0',
        top: '4px',
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

const Container = styled('div')({
    position: 'relative',
    paddingBottom: `${LINE_GAP - TAG_GAP * 2}px`,
    '&:hover': {
        [StyledTriggerLine.toString()]: {
            '&::before': {
                display: 'flex',
            },
            '&::after': {
                width: '100%',
            },
        },
    },
});
