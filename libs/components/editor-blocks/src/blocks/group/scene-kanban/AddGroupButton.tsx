import { useKanban } from '@toeverything/components/editor-core';
import { DoneIcon } from '@toeverything/components/icons';
import {
    IconButton,
    MuiClickAwayListener,
    MuiPopper,
} from '@toeverything/components/ui';
import type { ChangeEvent, KeyboardEvent, MouseEvent } from 'react';
import { useCallback, useState } from 'react';
import { AddGroupWrapper, PopperContainer } from './styles';

export const AddGroupButton = () => {
    const { addGroup } = useKanban();
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [groupName, setGroupName] = useState('');
    const open = Boolean(anchorEl);
    const disabledAddGroup = !groupName;

    const handleClick = useCallback(
        async (event: MouseEvent<HTMLElement>) => {
            if (open) {
                setAnchorEl(null);
                return;
            }
            setGroupName('');
            setAnchorEl(event.currentTarget);
        },
        [open]
    );

    const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
        setGroupName(e.target.value.trim());
    }, []);

    const handleConfirm = useCallback(async () => {
        if (!groupName) {
            return;
        }
        const result = await addGroup(groupName);
        if (result) {
            setAnchorEl(null);
        }
    }, [addGroup, groupName]);

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') {
            return;
        }
        handleConfirm();
    };

    return (
        <>
            <AddGroupWrapper onClick={handleClick}>+</AddGroupWrapper>
            <MuiPopper open={open} anchorEl={anchorEl} placement="bottom-start">
                <MuiClickAwayListener onClickAway={() => setAnchorEl(null)}>
                    <PopperContainer>
                        <input
                            type="text"
                            autoFocus
                            value={groupName}
                            onChange={handleChange}
                            onKeyDown={handleKeyDown}
                            placeholder="Add..."
                        />
                        <IconButton
                            aria-label="done"
                            disabled={disabledAddGroup}
                            onClick={handleConfirm}
                        >
                            <DoneIcon />
                        </IconButton>
                    </PopperContainer>
                </MuiClickAwayListener>
            </MuiPopper>
        </>
    );
};
