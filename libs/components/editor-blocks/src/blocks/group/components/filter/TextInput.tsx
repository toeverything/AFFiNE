import { useCallback } from 'react';
import { styled, MuiInputBase } from '@toeverything/components/ui';
import type { ChangeEvent } from 'react';

const StyledTextInput = styled(MuiInputBase)(({ theme }) => ({
    '& .MuiInputBase-input': {
        borderRadius: 4,
        position: 'relative',
        border: '1px solid #ced4da',
        fontSize: 14,
        width: 'auto',
        height: 30,
        padding: '0 8px',
        margin: '0 12px 0 6px',
        '&:focus': {
            borderColor: theme.palette.primary.main,
        },
    },
}));

interface Props {
    value: string;
    onChange: (value: string) => void;
}

export const TextInput = ({ value, onChange }: Props) => {
    const onInputChange = useCallback(
        (e: ChangeEvent<HTMLInputElement>) => {
            onChange(e.target.value);
        },
        [onChange]
    );

    return (
        <StyledTextInput
            value={value}
            id="text-input"
            onChange={onInputChange}
        />
    );
};
