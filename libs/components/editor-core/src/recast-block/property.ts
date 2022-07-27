import { nanoid } from 'nanoid';
import { useCallback } from 'react';
import { AsyncBlock } from '../editor';
import { useRecastBlock } from './Context';
import type { RecastBlock, RecastItem, StatusProperty } from './types';
import {
    META_PROPERTIES_KEY,
    MultiSelectProperty,
    PropertyType,
    RecastBlockValue,
    RecastMetaProperty,
    RecastPropertyId,
    SelectOption,
    SelectOptionId,
    SelectProperty,
    TABLE_VALUES_KEY,
} from './types';

/**
 * Generate a unique id for a property
 */
const genPropertyId = () => nanoid(16) as RecastPropertyId; // This is a safe type cast

/**
 * Generate a unique id for a select option
 */
export const genSelectOptionId = () => nanoid(16) as SelectOptionId; // This is a safe type cast

/**
 * Clone all **meta** properties to other block
 * The meta of the `toRecastBlock` will be changed in place!
 */
export const cloneRecastMetaTo = async (
    fromRecastBlock: RecastBlock,
    ...toRecastBlock: RecastBlock[]
) => {
    const blockProperties = fromRecastBlock.getProperty(META_PROPERTIES_KEY);
    for (const group of toRecastBlock) {
        await group.setProperty(META_PROPERTIES_KEY, blockProperties);
    }
    return blockProperties;
};

const mergeSelectOptions = (
    select1: SelectOption[],
    select2: SelectOption[]
): SelectOption[] => {
    // TODO: handle duplicate names
    return [...select1, ...select2].filter(
        (value, index, self) => index === self.findIndex(t => t.id === value.id)
    );
};

/**
 * The meta of the `toRecastBlock` will be changed in place!
 */
export const mergeRecastMeta = async (
    toRecastBlock: RecastBlock,
    fromRecastBlock: RecastBlock
) => {
    const fromBlockProperties =
        fromRecastBlock.getProperty(META_PROPERTIES_KEY) ?? [];
    const toBlockProperties =
        toRecastBlock.getProperty(META_PROPERTIES_KEY) ?? [];
    const newProperty = [...toBlockProperties];
    for (const fromProp of fromBlockProperties) {
        const theSameProperty = toBlockProperties.find(
            toProp => toProp.id === fromProp.id
        );
        if (!theSameProperty) {
            newProperty.push(fromProp);
            continue;
        }
        if (theSameProperty.type !== fromProp.type) {
            console.error(
                'Can not merge properties',
                theSameProperty,
                fromProp
            );
            throw new Error(
                'Failed to merge properties! There are two properties with the same id that have different types!'
            );
        }
        switch (theSameProperty.type) {
            case PropertyType.Select:
            case PropertyType.MultiSelect: {
                // Caution! Here the value of the property is overwritten directly
                theSameProperty.options = mergeSelectOptions(
                    theSameProperty.options,
                    // The type cast is safe because the type of the `fromProp` is same as the `theSameProperty`
                    (fromProp as typeof theSameProperty).options
                );
                break;
            }
            default: {
                // TODO: fix property merge
                console.warn(
                    'Can not merge properties',
                    theSameProperty,
                    'drop property',
                    fromProp
                );
                // throw new Error(
                //     'Failed to merge properties! Unknown property type'
                // );
            }
        }
    }

    await toRecastBlock.setProperty(META_PROPERTIES_KEY, newProperty);
};

/**
 * Get the recast block state
 *
 * Get/set multi-dimensional block meta properties
 * @public
 */
export const useRecastBlockMeta = () => {
    const recastBlock = useRecastBlock();
    const blockProperties = recastBlock.getProperty(META_PROPERTIES_KEY);

    const getProperties = useCallback(
        () => blockProperties ?? [],
        [blockProperties]
    );

    const getProperty = useCallback(
        (id: RecastPropertyId) =>
            blockProperties?.find(props => id === props.id),
        [blockProperties]
    );

    const addProperty = useCallback(
        async (propertyWithoutId: Omit<RecastMetaProperty, 'id'>) => {
            const newProperty = {
                id: genPropertyId(),
                ...propertyWithoutId,
            } as RecastMetaProperty;

            const nameDuplicated = blockProperties?.find(
                prop => prop.name === newProperty.name
            );
            if (nameDuplicated) {
                throw new Error('Duplicated property name');
            }
            const newProperties = [...(blockProperties ?? []), newProperty];
            const success = await recastBlock.setProperty(
                META_PROPERTIES_KEY,
                newProperties
            );
            if (!success) {
                console.error(
                    'Failed to set',
                    propertyWithoutId,
                    'newProperties',
                    newProperties
                );
                throw new Error('Failed to set property');
            }
            return newProperty;
        },
        [recastBlock, blockProperties]
    );

    const removeProperty = useCallback(
        (id: RecastPropertyId) => {
            const newProperties = blockProperties?.filter(
                property => property.id !== id
            );
            return recastBlock.setProperty(META_PROPERTIES_KEY, newProperties);
        },
        [recastBlock, blockProperties]
    );

    const updateProperty = useCallback(
        async (property: RecastMetaProperty) => {
            if (!blockProperties) {
                throw new Error(
                    'Cannot update property, because the block has no properties'
                );
            }
            const idx = blockProperties.findIndex(
                prop => prop.id === property.id
            );
            if (idx === -1) {
                console.error(blockProperties, property);
                throw new Error(
                    `Failed to update Property. The id "${property.id}" not found.`
                );
            }
            const success = await recastBlock.setProperty(META_PROPERTIES_KEY, [
                ...blockProperties.slice(0, idx),
                property,
                ...blockProperties.slice(idx + 1),
            ]);
            if (!success) {
                console.error(
                    'update property',
                    property,
                    'blockProperties',
                    blockProperties
                );
                throw new Error('Failed to update property');
            }
            return property;
        },
        [recastBlock, blockProperties]
    );

    return {
        getProperty,
        getProperties,
        addProperty,
        updateProperty,
        removeProperty,
    };
};

/**
 * Get the recast item value
 *
 * Get the value of the entry inside the multidimensional table
 * @public
 * @example
 * ```ts
 * const { getAllValue, getValue, setValue } = getRecastItemValue(block);
 *
 * ```
 */
export const getRecastItemValue = (block: RecastItem | AsyncBlock) => {
    const recastItem = block as unknown as RecastItem;
    const props = recastItem.getProperty(TABLE_VALUES_KEY) ?? {};

    const getAllValue = () => {
        return Object.values(props);
    };

    const getValue = (id: RecastPropertyId) => {
        return props[id];
    };

    const setValue = (newValue: RecastBlockValue) => {
        return recastItem.setProperty(TABLE_VALUES_KEY, {
            ...props,
            [newValue.id]: newValue,
        });
    };

    const removeValue = (propertyId: RecastPropertyId) => {
        const { [propertyId]: omitted, ...restProps } = props;
        return recastItem.setProperty(TABLE_VALUES_KEY, restProps);
    };
    return { getAllValue, getValue, setValue, removeValue };
};

const isSelectLikeProperty = (
    metaProperty?: RecastMetaProperty
): metaProperty is SelectProperty | MultiSelectProperty => {
    if (
        !metaProperty ||
        (metaProperty.type !== PropertyType.Select &&
            metaProperty.type !== PropertyType.MultiSelect)
    ) {
        return false;
    }
    return true;
};

/**
 * A helper to handle select property
 *
 * @example
 * ```ts
 * // Init useSelectProperty
 * const { createSelect, updateSelect } = useSelectProperty();
 *
 * // Create a new select property
 * const selectProp = await createSelect({ name: 'Select Prop', options: [{ name: 'select 1' }] })
 * const selectProp2 = await createSelect({ name: 'Select Prop', type: PropertyType.Select })
 *
 * // Update select property
 * await updateSelect(selectProp).addSelectOptions({ name: 'select 2' })
 * ```
 */
export const useSelectProperty = () => {
    const { getProperty, addProperty, updateProperty } = useRecastBlockMeta();

    /**
     * Notice: Before use, you need to check whether the name is repeated manually.
     */
    const createSelect = async <
        T extends SelectProperty | MultiSelectProperty | StatusProperty
    >({
        name,
        options = [],
        type = PropertyType.Select,
    }: {
        name: string;
        options?: Omit<SelectOption, 'id'>[];
        type?: T['type'];
    }) => {
        const selectProperty = {
            name,
            type,
            options: options.map(option => ({
                ...option,
                id: genSelectOptionId(),
            })),
        };
        return (await addProperty(selectProperty)) as T;
    };

    const updateSelect = (
        selectProperty: SelectProperty | MultiSelectProperty
    ) => {
        // if (typeof selectProperty === 'string') {
        //     const maybeSelectProperty = getProperty(selectProperty);
        //     if (maybeSelectProperty) {
        //         selectProperty = maybeSelectProperty;
        //     }
        // }
        if (!isSelectLikeProperty(selectProperty)) {
            console.error('selectProperty', selectProperty);
            throw new Error(
                `Incorrect usage of "selectPropertyHelper.updateSelect". The property is not a select property.`
            );
        }

        /**
         * Notice: Before use, you need to call {@link hasSelectOptions} to check whether the name is repeated
         */
        const addSelectOptions = (...options: Omit<SelectOption, 'id'>[]) => {
            const newOptions = [
                ...selectProperty.options,
                ...options.map(option => ({
                    ...option,
                    id: genSelectOptionId(),
                })),
            ];
            return updateProperty({
                ...selectProperty,
                options: newOptions,
            });
        };

        /**
         * Notice: Before use, you need to call {@link hasSelectOptions} to check whether the name is repeated
         */
        const renameSelectOptions = (targetOption: SelectOption) => {
            const newOptions = selectProperty.options.map(option => {
                if (option.id === targetOption.id) {
                    return {
                        ...option,
                        name: targetOption.name,
                    };
                }
                return option;
            });
            return updateProperty({
                ...selectProperty,
                options: newOptions,
            });
        };

        const removeSelectOptions = (...options: SelectOptionId[]) => {
            const newOptions = selectProperty.options.filter(
                i => !options.some(id => id === i.id)
            );
            return updateProperty({
                ...selectProperty,
                options: newOptions,
            });
        };

        const hasSelectOptions = (name: string) => {
            return selectProperty.options.some(option => option.name === name);
        };
        return {
            addSelectOptions,
            renameSelectOptions,
            removeSelectOptions,
            hasSelectOptions,
        };
    };

    return {
        createSelect,
        updateSelect,
    };
};
