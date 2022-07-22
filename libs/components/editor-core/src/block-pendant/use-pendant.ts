import { removePropertyValueRecord, setLatestPropertyValue } from './utils';
import { AsyncBlock } from '../editor';
import {
    getRecastItemValue,
    RecastMetaProperty,
    useRecastBlock,
} from '../recast-block';

export const usePendant = (block: AsyncBlock) => {
    // const { getProperties, removeProperty } = useRecastBlockMeta();
    const recastBlock = useRecastBlock();
    const { getValue, setValue, removeValue } = getRecastItemValue(block);
    // const { updateSelect } = useSelectProperty();

    const setPendant = async (property: RecastMetaProperty, newValue: any) => {
        const nv = {
            id: property.id,
            type: property.type,
            value: newValue,
        };
        await setValue(nv);
        setLatestPropertyValue({
            recastBlockId: recastBlock.id,
            blockId: block.id,
            value: nv,
        });
    };

    const removePendant = async (property: RecastMetaProperty) => {
        await removeValue(property.id);
        removePropertyValueRecord({
            recastBlockId: block.id,
            propertyId: property.id,
        });
    };

    return {
        setPendant,
        removePendant,
    };
};
