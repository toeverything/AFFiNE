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
import { IconMap, defaultPendantColors } from './config';

type PendantTagProps = {
    value: RecastBlockValue;
    property: RecastMetaProperty;
} & TagProps;

const MultiSelectRender = ({
    options,
    tagProps,
    property,
}: {
    options: SelectOption[];
    tagProps: TagProps;
    property: RecastMetaProperty;
}) => {
    const { style, ...otherProps } = tagProps;

    return (
        <>
            {options.map((option: SelectOption) => {
                const { background, color, icon, content } = getOptionInfo({
                    option,
                    property,
                });
                return (
                    <Tag
                        key={option.id}
                        {...otherProps}
                        style={{
                            background: style?.background || background,
                            color: style?.color || color,
                            ...style,
                        }}
                        startElement={icon}
                    >
                        {content}
                    </Tag>
                );
            })}
        </>
    );
};

const getOptionInfo = ({
    option,
    property,
}: {
    option: SelectOption;
    property: RecastMetaProperty;
}) => {
    const { type } = property;
    const {
        background: defaultBackground,
        color: defaultColor,
        iconName: defaultIconName,
    } = defaultPendantColors[type];
    const Icon =
        IconMap[option?.iconName as IconNames] ||
        IconMap[defaultIconName as IconNames];

    return {
        background: option?.background || defaultBackground,
        color: option?.color || defaultColor,
        icon: Icon && (
            <Icon
                style={{
                    fontSize: 12,
                    marginRight: '4px',
                }}
            />
        ),
        content: option?.name || property.name,
    };
};

const getNormalInfo = (
    value: RecastBlockValue,
    property: RecastMetaProperty
) => {
    const type = value.type;
    const {
        background: defaultBackground,
        color: defaultColor,
        iconName: defaultIconName,
    } = defaultPendantColors[type];

    const {
        background: customBackground,
        color: customColor,
        iconName,
    } = property;
    const background = customBackground || defaultBackground;
    const color = customColor || defaultColor;
    const Icon =
        IconMap[iconName as IconNames] || IconMap[defaultIconName as IconNames];

    return {
        background,
        color,
        icon: Icon && (
            <Icon
                style={{
                    fontSize: 12,
                    marginRight: '4px',
                }}
            />
        ),
    };
};

export const PendantTag = (props: PendantTagProps) => {
    const { value, property, ...tagProps } = props;
    const { style: styleTagStyle, ...otherTagProps } = tagProps;

    if (value.type === PendantTypes.Text) {
        const { value: textValue } = value as TextValue;
        const { background, color, icon } = getNormalInfo(value, property);
        return (
            <Tag
                style={{
                    background,
                    color,
                    ...styleTagStyle,
                }}
                startElement={icon}
                {...otherTagProps}
            >
                {textValue}
            </Tag>
        );
    }

    if (value.type === PendantTypes.Date) {
        const { value: dateValue } = value as DateValue;
        const { background, color, icon } = getNormalInfo(value, property);
        const content = Array.isArray(dateValue)
            ? `${format(dateValue[0], 'yyyy-MM-dd')} ~ ${format(
                  dateValue[1],
                  'yyyy-MM-dd'
              )}`
            : format(dateValue, 'yyyy-MM-dd');

        return (
            <Tag
                style={{
                    background,
                    color,
                    ...styleTagStyle,
                }}
                startElement={icon}
                {...otherTagProps}
            >
                {content}
            </Tag>
        );
    }

    if (value.type === PendantTypes.MultiSelect) {
        const { value: multiSelectValue } = value as MultiSelectValue;
        const selectedOptions = (
            property as MultiSelectProperty
        ).options.filter(o => multiSelectValue.includes(o.id));
        const { style, ...otherProps } = tagProps;

        if (selectedOptions.length) {
            return (
                <MultiSelectRender
                    options={selectedOptions}
                    tagProps={tagProps}
                    property={property}
                />
            );
        } else {
            const { background, color, icon } = getNormalInfo(value, property);

            return (
                <Tag
                    style={{
                        background,
                        color,
                        ...styleTagStyle,
                    }}
                    startElement={icon}
                    {...otherTagProps}
                >
                    {property.name}
                </Tag>
            );
        }
    }

    if (value.type === PendantTypes.Select) {
        const { value: selectValue } = value as SelectValue;
        const { style, ...otherProps } = tagProps;

        const option = (property as SelectProperty).options.find(
            o => o.id === selectValue
        );

        const { background, color, icon, content } = getOptionInfo({
            option,
            property,
        });

        return (
            <Tag
                style={{
                    background,
                    color,
                    ...style,
                }}
                startElement={icon}
                {...otherProps}
            >
                {content}
            </Tag>
        );
    }

    if (value.type === PendantTypes.Status) {
        const { value: statusValue } = value as StatusValue;
        const { style, ...otherProps } = tagProps;

        const option = (property as StatusProperty).options.find(
            o => o.id === statusValue
        );
        const { background, color, icon, content } = getOptionInfo({
            option,
            property,
        });

        return (
            <Tag
                style={{
                    background,
                    color,
                    ...style,
                }}
                startElement={icon}
                {...otherProps}
            >
                {content}
            </Tag>
        );
    }

    if (value.type === PendantTypes.Mention) {
        const { value: mentionValue } = value as MentionValue;
        const { background, color, icon } = getNormalInfo(value, property);

        return (
            <Tag
                style={{
                    background,
                    color,
                    ...styleTagStyle,
                }}
                startElement={icon}
                {...otherTagProps}
            >
                {mentionValue}
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
                        property={property}
                    />
                    <MultiSelectRender
                        options={phoneSelectedOptions}
                        tagProps={tagProps}
                        property={property}
                    />
                    <MultiSelectRender
                        options={locationSelectedOptions}
                        tagProps={tagProps}
                        property={property}
                    />
                </>
            );
        } else {
            const { background, color, icon } = getNormalInfo(value, property);

            return (
                <Tag
                    style={{
                        background,
                        color,
                        ...styleTagStyle,
                    }}
                    startElement={icon}
                    {...otherTagProps}
                >
                    {property.name}
                </Tag>
            );
        }
    }

    return <Tag {...tagProps}>{property.name}</Tag>;
};
