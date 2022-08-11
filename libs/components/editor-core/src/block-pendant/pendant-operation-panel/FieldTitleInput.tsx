import React from 'react';
import { Input, Tooltip, InputProps } from '@toeverything/components/ui';
import { StyledInputEndAdornment } from '../StyledComponent';
import { HelpCenterIcon } from '@toeverything/components/icons';

export const FieldTitleInput = (props: InputProps) => {
    return (
        <Input
            placeholder="Input your field name here"
            endAdornment={
                <Tooltip
                    offset={[15, -5]}
                    content="Name your tag of the current series"
                    placement="top"
                >
                    <StyledInputEndAdornment>
                        <HelpCenterIcon />
                    </StyledInputEndAdornment>
                </Tooltip>
            }
            {...props}
        />
    );
};
