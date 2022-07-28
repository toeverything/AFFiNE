import React, {
    CSSProperties,
    useEffect,
    useState,
    KeyboardEvent,
    useRef,
} from 'react';
import { Add, Close } from '@mui/icons-material';
import { ModifyPanelContentProps } from './types';
import {
    MultiSelectProperty,
    SelectProperty,
    SelectOptionId,
} from '../../recast-block';
import {
    Checkbox,
    Radio,
    styled,
    useTheme,
    Tooltip,
} from '@toeverything/components/ui';
import { HighLightIconInput } from './IconInput';
import { PendantConfig, IconNames, OptionIdType, OptionType } from '../types';
import { genBasicOption } from '../utils';

type OptionItemType = {
    option: OptionType;
    onNameChange: (id: OptionIdType, name: string) => void;
    onStatusChange: (id: OptionIdType, status: boolean) => void;
    onDelete: (id: OptionIdType) => void;
    onInsertOption: (id: OptionIdType) => void;
    checked: boolean;
    isMulti: boolean;
    iconConfig: {
        name: IconNames;
        background: CSSProperties['background'];
        color: CSSProperties['color'];
    };
    onEnter?: (e: KeyboardEvent) => void;
    focused?: boolean;
    tabIndex?: number;
};

type SelectPropsType = {
    isMulti?: boolean;
    onEnter?: (e: KeyboardEvent) => void;
} & ModifyPanelContentProps;

export const BasicSelect = ({
    isMulti = false,
    initialValue,
    onValueChange,
    onPropertyChange,
    initialOptions = [],
    iconConfig,
}: {
    isMulti?: boolean;
    initialValue: SelectOptionId[];
    initialOptions: OptionType[];
    onValueChange: (value: any) => void;
    onPropertyChange?: (newProperty: any) => void;
    iconConfig?: PendantConfig;
    onEnter?: (e: KeyboardEvent) => void;
}) => {
    const [options, setOptions] = useState<OptionType[]>(initialOptions);
    const [selectIds, setSelectIds] = useState<OptionIdType[]>(initialValue);

    const insertOption = (insertId: OptionIdType) => {
        const newOption = genBasicOption({
            index: options.length + 1,
            iconConfig,
        });
        const index = options.findIndex(o => o.id === insertId);
        options.splice(index + 1, 0, newOption);
        setOptions([...options]);
    };
    const deleteOption = (id: OptionIdType) => {
        if (options.length === 1) {
            return;
        }
        const deleteOptionIndex = options.findIndex(o => o.id === id);
        options.splice(deleteOptionIndex, 1);
        setOptions([...options]);
    };

    const onNameChange = (id: OptionIdType, name: string) => {
        const changedIndex = options.findIndex(o => o.id === id);
        options[changedIndex].name = name;
        setOptions([...options]);
    };

    const onStatusChange = (id: OptionIdType, status: boolean) => {
        if (status) {
            if (isMulti) {
                selectIds.push(id);
                setSelectIds([...selectIds]);
            } else {
                setSelectIds([id]);
            }
        } else {
            const index = selectIds.findIndex(selectId => selectId === id);
            selectIds.splice(index, 1);
            setSelectIds([...selectIds]);
        }
    };

    useEffect(() => {
        onValueChange(isMulti ? selectIds : selectIds[0]);
    }, [selectIds, onValueChange]);

    useEffect(() => {
        if (options.every(o => !o.name)) {
            return;
        }
        onPropertyChange?.([...options.filter(o => o.name)]);
    }, [options, onPropertyChange]);

    return (
        <div className="">
            {options.map((option, index) => {
                const checked = selectIds.includes(option.id);

                return (
                    <OptionItem
                        key={option.id}
                        focused={index === options.length - 1}
                        isMulti={isMulti}
                        checked={checked}
                        option={option}
                        onNameChange={onNameChange}
                        onStatusChange={onStatusChange}
                        onDelete={deleteOption}
                        onInsertOption={insertOption}
                        iconConfig={{
                            name: option?.iconName as IconNames,
                            color: option?.color,
                            background: option?.background,
                        }}
                        onEnter={() => {
                            insertOption(options[options.length - 1].id);
                        }}
                        tabIndex={index + 1}
                    />
                );
            })}

            <StyledAddButton
                onClick={() => {
                    insertOption(options[options.length - 1].id);
                }}
            >
                <Add style={{ fontSize: 12, marginRight: 4 }} />
                Add New
            </StyledAddButton>
        </div>
    );
};
export const Select = ({
    isMulti = false,
    initialValue,
    property,
    onValueChange,
    onPropertyChange,
    initialOptions = [],
    iconConfig,
}: SelectPropsType) => {
    const propProperty = property as SelectProperty | MultiSelectProperty;
    const propInitialValueValue = initialValue?.value as
        | SelectOptionId
        | SelectOptionId[];

    return (
        <BasicSelect
            isMulti={isMulti}
            iconConfig={iconConfig}
            initialValue={
                propInitialValueValue
                    ? isMulti
                        ? (propInitialValueValue as SelectOptionId[])
                        : [propInitialValueValue as SelectOptionId]
                    : []
            }
            onValueChange={onValueChange}
            onPropertyChange={onPropertyChange}
            initialOptions={propProperty?.options || initialOptions}
        />
    );
};

const OptionItem = ({
    option,
    onNameChange,
    onStatusChange,
    onDelete,
    onInsertOption,
    checked,
    isMulti,
    iconConfig,
    onEnter,
    focused,
    tabIndex,
}: OptionItemType) => {
    const theme = useTheme();
    const inputRef = useRef<HTMLInputElement>();
    useEffect(() => {
        focused && inputRef.current?.focus();
    }, [focused]);
    return (
        <HighLightIconInput
            tabIndex={tabIndex}
            ref={inputRef}
            iconName={iconConfig?.name}
            color={iconConfig?.color}
            background={iconConfig?.background}
            value={option.name}
            placeholder="Option content"
            onKeyDown={(e: KeyboardEvent) => {
                if (e.code === 'Enter') {
                    onEnter?.(e);
                    e.preventDefault();
                }
                if (e.ctrlKey && e.code === 'Backspace') {
                    onDelete?.(option.id);
                    e.preventDefault();
                }
            }}
            onChange={e => {
                onNameChange(option.id, e.target.value);
            }}
            startElement={
                <StyledOptionBox>
                    {isMulti ? (
                        <Checkbox
                            checked={checked}
                            onChange={e => {
                                onStatusChange(option.id, e.target.checked);
                            }}
                            size="small"
                        />
                    ) : (
                        <Radio
                            checked={checked}
                            onChange={e => {
                                onStatusChange(option.id, e.target.checked);
                            }}
                            size="small"
                        />
                    )}
                </StyledOptionBox>
            }
            endElement={
                <StyledCloseButton
                    onClick={() => {
                        onDelete(option.id);
                    }}
                >
                    <Tooltip content="ctrl + backspace">
                        <Close
                            style={{
                                fontSize: 12,
                                color: theme.affine.palette.icons,
                            }}
                        />
                    </Tooltip>
                </StyledCloseButton>
            }
        />
    );
};

const StyledIconWrapper = styled('div')`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-right: 12px;
    width: 20px;
    height: 20px;
    border-radius: 3px;
`;
const StyledOptionBox = styled('div')`
    display: inline-flex;
    margin-right: 12px;
`;

const StyledCloseButton = styled('button')`
    display: flex;
    align-items: center;
    justify-content: center;
    height: 20px;
    width: 20px;
`;

const StyledAddButton = styled('button')(({ theme }) => {
    return {
        height: 26,
        padding: '0 8px',
        color: theme.affine.palette.primaryText,
        display: 'inline-flex',
        justifyContent: 'center',
        alignItems: 'center',
        fontSize: 14,
        marginTop: 12,
    };
});
