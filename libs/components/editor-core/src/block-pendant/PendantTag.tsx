import React from 'react';
import { Tag, type TagProps } from '@toeverything/components/ui';
import {
    DateValue,
    InformationProperty,
    InformationValue,
    MentionValue,
    MultiSelectProperty,
    MultiSelectValue,
    RecastBlockValue,
    RecastMetaProperty,
    SelectOption,
    SelectProperty,
    SelectValue,
    StatusProperty,
    StatusValue,
    TextValue,
} from '../recast-block';
import { IconNames, PendantTypes } from './types';
import format from 'date-fns/format';
import { IconMap, pendantColors } from './config';

type PendantTagProps = {
    value: RecastBlockValue;
    property: RecastMetaProperty;
} & TagProps;

const MultiSelectRender = ({
    options,
    tagProps,
}: {
    options: SelectOption[];
    tagProps: TagProps;
}) => {
    const { style, ...otherProps } = tagProps;
    return (
        <>
            {options.map((option: SelectOption) => {
                const Icon = IconMap[option.iconName as IconNames];
                return (
                    <Tag
                        key={option.id}
                        {...otherProps}
                        style={{
                            background: style?.background || option.background,
                            color: style?.color || option.color,
                            ...style,
                        }}
                        startElement={
                            Icon && (
                                <Icon
                                    style={{
                                        fontSize: 12,
                                        color: style?.color || option.color,
                                        marginRight: '4px',
                                    }}
                                />
                            )
                        }
                    >
                        {option.name}
                    </Tag>
                );
            })}
        </>
    );
};

export const PendantTag = (props: PendantTagProps) => {
    const { value, property, ...tagProps } = props;
    const {
        background: customBackground,
        color: customColor,
        iconName,
    } = property;
    const { style: styleTagStyle, ...otherTagProps } = tagProps;
    const type = value.type;
    const { background: defaultBackground, color: defaultColor } =
        pendantColors[type];

    const background = customBackground || defaultBackground;
    const color = customColor || defaultColor;
    const Icon = IconMap[iconName as IconNames];
    if (value.type === PendantTypes.Text) {
        const { value: textValue } = value as TextValue;
        return (
            <Tag
                style={{
                    background,
                    color,
                    ...styleTagStyle,
                }}
                startElement={
                    Icon && (
                        <Icon
                            style={{
                                fontSize: 12,
                                color: color || '#fff',
                                marginRight: '4px',
                            }}
                        />
                    )
                }
                {...otherTagProps}
            >
                {textValue}
            </Tag>
        );
    }

    if (value.type === PendantTypes.Date) {
        const { value: dateValue } = value as DateValue;
        if (Array.isArray(dateValue)) {
            return (
                <Tag
                    style={{
                        background,
                        color,
                        ...styleTagStyle,
                    }}
                    startElement={
                        Icon && (
                            <Icon
                                style={{
                                    fontSize: 12,
                                    color: color || '#fff',
                                    marginRight: '4px',
                                }}
                            />
                        )
                    }
                    {...otherTagProps}
                >
                    {format(dateValue[0], 'yyyy-MM-dd')} ~{' '}
                    {format(dateValue[1], 'yyyy-MM-dd')}
                </Tag>
            );
        }
        return (
            <Tag
                style={{
                    background,
                    color,
                    ...styleTagStyle,
                }}
                startElement={
                    Icon && (
                        <Icon
                            style={{
                                fontSize: 12,
                                color: color || '#fff',
                                marginRight: '4px',
                            }}
                        />
                    )
                }
                {...otherTagProps}
            >
                {format(dateValue, 'yyyy-MM-dd')}
            </Tag>
        );
    }

    if (value.type === PendantTypes.MultiSelect) {
        const { value: multiSelectValue } = value as MultiSelectValue;
        const selectedOptions = (
            property as MultiSelectProperty
        ).options.filter(o => multiSelectValue.includes(o.id));

        if (selectedOptions.length) {
            return (
                <MultiSelectRender
                    options={selectedOptions}
                    tagProps={tagProps}
                />
            );
        }
    }

    if (value.type === PendantTypes.Select) {
        const { value: selectValue } = value as SelectValue;
        const { style, ...otherProps } = tagProps;

        const option = (property as SelectProperty).options.find(
            o => o.id === selectValue
        );
        const OptionIcon = IconMap[option.iconName as IconNames];
        return (
            <Tag
                style={{
                    background: option.background,
                    color: option.color,
                    ...style,
                }}
                startElement={
                    OptionIcon && (
                        <OptionIcon
                            style={{
                                fontSize: 12,
                                color: option.color || '#fff',
                                marginRight: '4px',
                            }}
                        />
                    )
                }
                {...otherProps}
            >
                {option.name}
            </Tag>
        );
    }

    if (value.type === PendantTypes.Status) {
        const { value: statusValue } = value as StatusValue;
        const { style, ...otherProps } = tagProps;

        const option = (property as StatusProperty).options.find(
            o => o.id === statusValue
        );
        const OptionIcon = IconMap[option.iconName as IconNames];

        return (
            <Tag
                style={{
                    background: option.background,
                    color: option.color,
                    ...style,
                }}
                startElement={
                    OptionIcon && (
                        <OptionIcon
                            style={{
                                fontSize: 12,
                                color: option.color || '#fff',
                                marginRight: '4px',
                            }}
                        />
                    )
                }
                {...otherProps}
            >
                {option.name}
            </Tag>
        );
    }

    if (value.type === PendantTypes.Mention) {
        const { value: mentionValue } = value as MentionValue;

        return (
            <Tag
                style={{
                    background,
                    color,
                    ...styleTagStyle,
                }}
                startElement={
                    Icon && (
                        <Icon
                            style={{
                                fontSize: 12,
                                color: color || '#fff',
                                marginRight: '4px',
                            }}
                        />
                    )
                }
                {...otherTagProps}
            >
                @{mentionValue}
            </Tag>
        );
    }

    if (value.type === PendantTypes.Information) {
        const {
            value: { email, location, phone },
        } = value as InformationValue;
        const { emailOptions, phoneOptions, locationOptions } =
            property as InformationProperty;

        const emailSelectedOptions = emailOptions.filter(o =>
            email.includes(o.id)
        );
        const phoneSelectedOptions = phoneOptions.filter(o =>
            phone.includes(o.id)
        );
        const locationSelectedOptions = locationOptions.filter(o =>
            location.includes(o.id)
        );

        if (
            emailSelectedOptions.length ||
            phoneSelectedOptions.length ||
            locationSelectedOptions.length
        ) {
            return (
                <>
                    <MultiSelectRender
                        options={emailSelectedOptions}
                        tagProps={tagProps}
                    />
                    <MultiSelectRender
                        options={phoneSelectedOptions}
                        tagProps={tagProps}
                    />
                    <MultiSelectRender
                        options={locationSelectedOptions}
                        tagProps={tagProps}
                    />
                </>
            );
        }
    }

    return <Tag {...tagProps}>{property.name}</Tag>;
};
