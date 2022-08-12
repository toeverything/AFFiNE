import { useCallback } from 'react';
import { styled } from '../styled';
import type { FC, CSSProperties, ChangeEvent } from 'react';

/**
 * WARNING: This component is about to be deprecated, use Select replace
 *
 * **/
const StyledSelect = styled('select')({
    border: '1px solid #aaa',
});

interface Props {
    value: string;
    options?: Array<{ label?: string; value?: string; key?: string }>;
    onChange: (value: string) => void;
    extraStyle?: CSSProperties;
}

export const OldSelect = ({ value, options, onChange, extraStyle }: Props) => {
    const onSelectChange = useCallback(
        (e: ChangeEvent<HTMLSelectElement>) => {
            onChange(e.target.value);
        },
        [onChange]
    );

    return (
        <StyledSelect
            style={extraStyle}
            value={value}
            onChange={onSelectChange}
        >
            {options?.map(option => {
                return (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                );
            })}
        </StyledSelect>
    );
};
