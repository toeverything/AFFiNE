import type { KanbanGroup } from '@toeverything/components/editor-core';
import {
    DEFAULT_GROUP_ID,
    PropertyType,
    useKanban,
} from '@toeverything/components/editor-core';
import { DeleteCashBinIcon, DoneIcon } from '@toeverything/components/icons';
import {
    IconButton,
    MuiClickAwayListener,
    MuiPopper,
} from '@toeverything/components/ui';
import type {
    ChangeEvent,
    CSSProperties,
    KeyboardEvent,
    MouseEvent,
} from 'react';
import { useCallback, useState } from 'react';
import { AddGroupButton } from './AddGroupButton';
import { CardContext } from './CardContext';
import { CardContextWrapper } from './dndable/wrapper/CardContextWrapper';
import { DroppableContainer } from './dndable/wrapper/DroppableContainer';
import {
    KanbanBoard,
    KanbanContainer,
    KanbanHeader,
    PopperContainer,
    Tag,
} from './styles';
import type { CardContainerProps } from './types';

const getKanbanColor = (
    group: KanbanGroup
): [color: CSSProperties['color'], background: CSSProperties['background']] => {
    const DEFAULT_COLOR: [
        color: CSSProperties['color'],
        background: CSSProperties['background']
    ] = ['#3A4C5C', 'transparent'];
    if (!group) {
        return DEFAULT_COLOR;
    }
    if (
        group.type === PropertyType.Status ||
        group.type === PropertyType.Select ||
        group.type === PropertyType.MultiSelect ||
        group.type === DEFAULT_GROUP_ID
    ) {
        return [group.color, group.background];
    }
    // TODO other type color
    return DEFAULT_COLOR;
};

const KanbanTag = (group: KanbanGroup) => {
    const { removeGroup, renameGroup, checkIsDefaultGroup } = useKanban();
    const [renamingGroupName, setRenamingGroupName] = useState(group.name);
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);
    // Default group should not be renamed
    const isDefaultGroup = checkIsDefaultGroup(group);
    // Cannot be named empty string
    const disabledRenameBtn = !renamingGroupName;

    const handleClickTag = useCallback(
        async (event: MouseEvent<HTMLElement>) => {
            if (isDefaultGroup) {
                return;
            }
            if (anchorEl) {
                setAnchorEl(null);
                return;
            }
            setAnchorEl(event.currentTarget);
            // Reset to current groupName
            setRenamingGroupName(group.name);
        },
        [anchorEl, group.name, isDefaultGroup]
    );

    const handleInputChange = useCallback(
        (e: ChangeEvent<HTMLInputElement>) => {
            setRenamingGroupName(e.target.value.trim());
        },
        []
    );

    const handleRename = useCallback(async () => {
        if (!renamingGroupName) {
            return;
        }
        const result = await renameGroup(group, renamingGroupName);
        if (result) {
            setAnchorEl(null);
        }
    }, [group, renamingGroupName, renameGroup]);

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') {
            return;
        }
        if (!renamingGroupName) {
            return;
        }
        handleRename();
    };

    const handleDelete = useCallback(() => {
        removeGroup(group);
        setAnchorEl(null);
    }, [group, removeGroup]);

    const [color, bg] = getKanbanColor(group);

    return (
        <MuiClickAwayListener onClickAway={() => setAnchorEl(null)}>
            <Tag
                interactive={!isDefaultGroup}
                color={color}
                background={bg}
                onClick={handleClickTag}
            >
                <span>{group.name}</span>

                <MuiPopper
                    open={open}
                    anchorEl={anchorEl}
                    placement="bottom-start"
                >
                    <PopperContainer>
                        <input
                            type="text"
                            autoFocus
                            value={renamingGroupName}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                        />
                        <IconButton aria-label="delete" onClick={handleDelete}>
                            <DeleteCashBinIcon />
                        </IconButton>
                        <IconButton
                            aria-label="done"
                            disabled={disabledRenameBtn}
                            onClick={handleRename}
                        >
                            <DoneIcon />
                        </IconButton>
                    </PopperContainer>
                </MuiPopper>
            </Tag>
        </MuiClickAwayListener>
    );
};

export const CardContainer = (props: CardContainerProps) => {
    const { kanban } = useKanban();
    const { containerIds, items: dataSource, activeId } = props;
    return (
        <KanbanContainer>
            {containerIds.map((containerId, idx) => {
                const items = dataSource[containerId];

                return (
                    <KanbanBoard key={containerId}>
                        <KanbanHeader>
                            <KanbanTag {...kanban[idx]} />
                            <span
                                style={{
                                    marginLeft: '10px',
                                    color: getKanbanColor(kanban[idx])[0],
                                }}
                            >
                                {items.length}
                            </span>
                        </KanbanHeader>
                        <DroppableContainer
                            key={containerId}
                            id={containerId}
                            items={items}
                        >
                            <CardContextWrapper
                                containerId={containerId}
                                items={items}
                                render={({ items }) => (
                                    <CardContext
                                        group={kanban[idx]}
                                        items={items}
                                        activeId={activeId}
                                    />
                                )}
                            />
                        </DroppableContainer>
                    </KanbanBoard>
                );
            })}
            <KanbanBoard>
                <AddGroupButton />
            </KanbanBoard>
        </KanbanContainer>
    );
};
