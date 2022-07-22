import type { FC } from 'react';
import type { AsyncBlock } from '../editor';
import { RenderBlock } from './RenderBlock';

interface RenderChildrenProps {
    block: AsyncBlock;
}

export const RenderBlockChildren: FC<RenderChildrenProps> = ({ block }) => {
    return block.childrenIds.length ? (
        <>
            {block.childrenIds.map(childId => {
                return <RenderBlock key={childId} blockId={childId} />;
            })}
        </>
    ) : null;
};
