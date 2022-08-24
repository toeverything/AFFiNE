import { styled } from '@toeverything/components/ui';
import type { PropsWithChildren } from 'react';
import { useRef } from 'react';
import type { AsyncBlock } from '../editor';
import { getRecastItemValue, useRecastBlockMeta } from '../recast-block';
import { PendantPopover } from './pendant-popover';
import { PendantRender } from './pendant-render';
/**
 * @deprecated
 */
interface BlockTagProps {
    block: AsyncBlock;
}

export const BlockPendantProvider = ({
    block,
    children,
}: PropsWithChildren<BlockTagProps>) => {
    const triggerRef = useRef<HTMLDivElement>();
    const { getProperties } = useRecastBlockMeta();
    const properties = getProperties();
    const { getValue } = getRecastItemValue(block);
    const showTriggerLine =
        properties.filter(property => getValue(property.id)).length === 0;

    return (
        <Container>
            {children}

            {showTriggerLine ? (
                <StyledPendantContainer ref={triggerRef}>
                    <PendantPopover
                        block={block}
                        // container={triggerRef.current}
                    >
                        <StyledTriggerLine />
                    </PendantPopover>
                </StyledPendantContainer>
            ) : null}

            <PendantRender block={block} />
        </Container>
    );
};

export const LINE_GAP = 16;
export const TAG_GAP = 4;

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
    padding: `${TAG_GAP * 2}px 0 ${LINE_GAP - TAG_GAP * 4}px 0`,
    '&:hover': {
        [`${StyledTriggerLine}`]: {
            '&::before': {
                opacity: '1',
            },
        },
    },
});
