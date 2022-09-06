import { styled } from '@toeverything/components/ui';
import type { AsyncBlock } from '../editor';
import { BlockRender } from './Context';
import { NullBlockRender } from './RenderBlock';

export interface RenderChildrenProps {
    block: AsyncBlock;
    indent?: boolean;
}

export const RenderBlockChildren = ({
    block,
    indent = true,
}: RenderChildrenProps) => {
    if (BlockRender === NullBlockRender) {
        return null;
    }

    return block.childrenIds.length ? (
        <StyledIdentWrapper indent={indent}>
            {block.childrenIds.map(childId => {
                return <BlockRender key={childId} blockId={childId} />;
            })}
        </StyledIdentWrapper>
    ) : null;
};

/**
 * Indent rendering child nodes
 */
const StyledIdentWrapper = styled('div')<{ indent?: boolean }>(
    ({ indent }) => ({
        display: 'flex',
        flexDirection: 'column',
        // TODO: marginLeft should use theme provided by styled
        ...(indent && { marginLeft: '30px' }),
    })
);
