/* eslint-disable no-restricted-imports */
import MuiCheckbox, { type CheckboxProps } from '@mui/material/Checkbox';
import {
    CheckBoxCheckIcon,
    CheckBoxUncheckIcon,
} from '@toeverything/components/icons';
import { styled } from '../styled';

export { CheckboxProps };

export const Checkbox = (props: CheckboxProps) => {
    return (
        <StyledCheckbox
            icon={<CheckBoxUncheckIcon />}
            checkedIcon={<CheckBoxCheckIcon />}
            {...props}
        />
    );
};

const StyledCheckbox = styled(MuiCheckbox)`
    padding: 0;
    color: #b9cad5;
    &.Mui-checked {
        color: #b9cad5;
    }
`;
