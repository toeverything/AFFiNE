import type { FC } from 'react';
import { styled } from '@toeverything/components/ui';
import { AsyncBlock, BlockEditor } from '@toeverything/framework/virgo';

type BlockContainerProps = Parameters<typeof Container>[0] & {
    block: AsyncBlock;
    editor: BlockEditor;
};

export const BlockContainer: FC<BlockContainerProps> = function ({
    block,
    children,
    className,
    editor,
    ...restProps
}) {
    return (
        <Container
            className={`${className || ''} block_container`}
            {...restProps}
        >
            {children}
        </Container>
    );
};

export const Container = styled('div')<{ selected: boolean }>(
    ({ selected, theme }) => ({
        backgroundColor: selected ? theme.affine.palette.textSelected : '',
        marginBottom: '2px',
    })
);
