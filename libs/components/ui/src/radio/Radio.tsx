import * as React from 'react';
/* eslint-disable no-restricted-imports */
import MuiRadio, { type RadioProps } from '@mui/material/Radio';
import { styled } from '../styled';

// TODO: sync online icon
// import {
//     SingleSelectBoxUncheckIcon,
//     SingleSelectBoxCheckIcon,
// } from '@toeverything/components/icons';

export { RadioProps };

export const Radio = (props: RadioProps) => {
    return (
        <StyledRadio
            // icon={<SingleSelectBoxUncheckIcon />}
            // checkedIcon={<SingleSelectBoxCheckIcon />}
            {...props}
        />
    );
};

const StyledRadio = styled(MuiRadio)`
    padding: 0;
    color: #b9cad5;
    &.Mui-checked {
        color: #b9cad5;
    }
`;
