import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import {
    styled,
    autocompleteClasses,
    useAutocomplete,
} from '@toeverything/components/ui';
import type { MouseEvent } from 'react';
import type { ValueOption } from './types';
import * as React from 'react';

const ListBox = styled('ul')`
    width: 300px;
    margin: 2px 0 0;
    padding: 0;
    position: absolute;
    list-style: none;
    background-color: #fff;
    overflow: auto;
    max-height: 250px;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    z-index: 1;

    & li {
        padding: 5px 12px;
        display: flex;

        & span {
            flex-grow: 1;
        }

        & svg {
            color: transparent;
        }
    }

    & li[aria-selected='true'] {
        background-color: #fafafa;
        font-weight: 600;

        & svg {
            color: #1890ff;
        }
    }

    & li.${autocompleteClasses.focused} {
        background-color: #e6f7ff;
        cursor: pointer;

        & svg {
            color: currentColor;
        }
    }
`;

const InputWrapper = styled('div')`
    min-width: 300px;
    min-height: 32px;
    border: 1px solid #d9d9d9;
    background-color: #fff;
    border-radius: 4px;
    padding: 1px;
    display: flex;
    flex-wrap: wrap;
    margin: 0 12px 0 6px;

    &:hover {
        border-color: #40a9ff;
    }

    &.focused {
        border-color: #40a9ff;
        box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
    }

    & input {
        background-color: #fff;
        color: rgba(0, 0, 0, 0.85);
        box-sizing: border-box;
        padding: 0 6px;
        width: 0;
        min-width: 30px;
        flex-grow: 1;
        border: 0;
        outline: 0;
    }
`;

const Tag = (props: {
    label: string;
    onDelete: (event: MouseEvent<SVGSVGElement>) => void;
}) => {
    const { label, onDelete, ...other } = props;
    return (
        <div {...other}>
            <span>{label}</span>
            <CloseIcon onClick={onDelete} />
        </div>
    );
};

const StyledTag = styled(Tag)`
    display: flex;
    align-items: center;
    height: 24px;
    margin: 2px;
    line-height: 22px;
    background-color: #fafafa;
    border: 1px solid #e8e8e8;
    border-radius: 2px;
    box-sizing: content-box;
    padding: 0 4px 0 10px;
    outline: 0;
    overflow: hidden;

    &:focus {
        border-color: #40a9ff;
        background-color: #e6f7ff;
    }

    & span {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
    }

    & svg {
        font-size: 12px;
        cursor: pointer;
        padding: 4px;
    }
`;

interface Props {
    initValue: string[];
    options: ValueOption[];
    onChange: (value: ValueOption[]) => void;
}

const MultipleChipInput = (props: Props) => {
    const { initValue, options, onChange } = props;
    const {
        getInputProps,
        getTagProps,
        getListboxProps,
        getOptionProps,
        groupedOptions,
        value,
        setAnchorEl,
    } = useAutocomplete({
        id: 'multiple-chip-select',
        multiple: true,
        options,
        value: initValue,
        getOptionLabel: option => (option as ValueOption).title,
        onChange: (event: React.SyntheticEvent, data) => {
            onChange(data as ValueOption[]);
        },
    });

    return (
        <>
            <InputWrapper ref={setAnchorEl}>
                {(value as ValueOption[]).map(
                    ({ title, value }, index: number) => (
                        <StyledTag
                            key={value}
                            label={title}
                            {...getTagProps({ index })}
                        />
                    )
                )}
                <input {...getInputProps()} />
            </InputWrapper>

            {!!groupedOptions.length && (
                <ListBox {...getListboxProps()}>
                    {(groupedOptions as ValueOption[]).map((option, index) => (
                        <li
                            key={option.value as string}
                            {...getOptionProps({ option, index })}
                        >
                            <span>{option.title}</span>
                            <CheckIcon fontSize="small" />
                        </li>
                    ))}
                </ListBox>
            )}
        </>
    );
};

export { MultipleChipInput };
