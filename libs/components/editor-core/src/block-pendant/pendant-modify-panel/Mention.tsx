import React, { CSSProperties, useState } from 'react';
import { useUserAndSpaces } from '@toeverything/datasource/state';
import {
    Option,
    Select,
    useTheme,
    MuiAvatar as Avatar,
} from '@toeverything/components/ui';
import { ModifyPanelContentProps } from './types';
import { PendantIcon } from './IconInput';

export default ({
    onValueChange,
    initialValue,
    iconConfig,
}: ModifyPanelContentProps) => {
    const {
        user: { username, nickname, photo },
    } = useUserAndSpaces();

    const [selectedValue, setSelectedValue] = useState(initialValue?.value);
    const [focus, setFocus] = useState(false);
    const theme = useTheme();
    return (
        <Select
            width={284}
            placeholder={
                <>
                    <PendantIcon
                        iconName={iconConfig?.name}
                        color={iconConfig?.color as CSSProperties['color']}
                        background={
                            iconConfig?.background as CSSProperties['background']
                        }
                    />
                    Select a collaborator
                </>
            }
            value={selectedValue}
            onChange={selectedValue => {
                setSelectedValue(selectedValue);
                onValueChange(selectedValue);
            }}
            style={{
                borderLeft: 'none',
                borderRight: 'none',
                borderRadius: '0',
                borderTop: focus
                    ? `1px solid ${theme.affine.palette.primary}`
                    : 'none',
                borderBottom: focus
                    ? `1px solid ${theme.affine.palette.primary}`
                    : 'none',
                transition: 'border-color .15s',
            }}
            onListboxOpenChange={open => {
                setFocus(open);
            }}
        >
            <Option value={nickname}>
                <Avatar
                    alt={username}
                    src={photo}
                    sx={{ width: 20, height: 20, marginRight: '12px' }}
                />
                {nickname}
            </Option>
        </Select>
    );
};
