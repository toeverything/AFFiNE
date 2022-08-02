import { getPendantController } from './utils';
import { AsyncBlock } from '../editor';
import { useRecastBlock } from '../recast-block';

export const usePendant = (block: AsyncBlock) => {
    // const { getProperties, removeProperty } = useRecastBlockMeta();
    const recastBlock = useRecastBlock();

    return getPendantController(recastBlock, block);
};
