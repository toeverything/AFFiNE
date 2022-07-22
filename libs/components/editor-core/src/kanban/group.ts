import { useSelectProperty } from '../recast-block/property';
import { PropertyType, RecastMetaProperty } from '../recast-block/types';
import { checkIsDefaultGroup } from './atom';
import { KanbanGroup } from './types';

export const useKanbanGroup = (groupBy: RecastMetaProperty) => {
    const { updateSelect } = useSelectProperty();

    switch (groupBy.type) {
        case PropertyType.MultiSelect:
        case PropertyType.Select: {
            const {
                addSelectOptions,
                renameSelectOptions,
                hasSelectOptions,
                removeSelectOptions,
            } = updateSelect(groupBy);

            const addGroup = async (name: string) => {
                if (!name) {
                    throw new Error(
                        'Failed to add new group! Group Name can not be empty'
                    );
                }
                if (hasSelectOptions(name)) {
                    throw new Error(
                        `Failed to add new group! Group name can not be repeated. name: ${name}`
                    );
                }
                return await addSelectOptions({ name });
            };

            const renameGroup = async (group: KanbanGroup, name: string) => {
                if (checkIsDefaultGroup(group)) {
                    console.error('Cannot rename default group', group);
                    return undefined;
                }
                if (groupBy.type !== group.type) {
                    console.error('groupBy:', groupBy, 'group:', group);
                    throw new Error(
                        `Inconsistent group type, groupBy: ${groupBy.type} group: ${group.type}`
                    );
                }
                if (!name) {
                    throw new Error(
                        'Failed to add rename group! Group Name can not be empty'
                    );
                }
                if (hasSelectOptions(name)) {
                    throw new Error(
                        `Failed to rename group! Group name can not be repeated. name: ${name}`
                    );
                }

                return await renameSelectOptions({ ...group, name });
            };

            const removeGroup = async (group: KanbanGroup) => {
                if (checkIsDefaultGroup(group)) {
                    console.error('Cannot remove default group', group);
                    return;
                }
                if (groupBy.type !== group.type) {
                    console.error('groupBy:', groupBy, 'group:', group);
                    throw new Error(
                        `Inconsistent group type, groupBy: ${groupBy.type} group: ${group.type}`
                    );
                }
                await removeSelectOptions(group.id);
            };

            return {
                addGroup,
                renameGroup,
                removeGroup,
                checkIsDefaultGroup,
            };
        }

        case PropertyType.Text: {
            const addGroup = async (name: string) => {
                throw new Error('TODO');
            };
            const renameGroup = async (group: KanbanGroup, name: string) => {
                throw new Error('TODO');
            };
            const removeGroup = async (group: KanbanGroup) => {
                throw new Error('TODO');
            };
            return {
                addGroup,
                renameGroup,
                removeGroup,
                checkIsDefaultGroup,
            };
        }
        // TODO: support other types

        default: {
            throw new Error(`Unsupported group type: ${groupBy.type}`);
        }
    }
};
