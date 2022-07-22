import {
    CheckBoxCheckIcon,
    CheckBoxUncheckIcon,
} from '@toeverything/components/icons';
import { styled } from '@toeverything/components/ui';
import type { CheckboxProps } from './types';

const StyledCheckbox = styled('div')({
    display: 'flex',
    alignItems: 'center',
});

const Checkbox = ({ value, onChange }: CheckboxProps) => {
    return (
        <StyledCheckbox onClick={onChange}>
            {value ? (
                <CheckBoxCheckIcon />
            ) : (
                <CheckBoxUncheckIcon style={{ color: '#4C6275' }} />
            )}
        </StyledCheckbox>
    );
};

export { Checkbox };
