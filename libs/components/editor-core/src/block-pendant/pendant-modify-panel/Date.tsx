import React, { useState } from 'react';

import { ModifyPanelContentProps } from './types';
import {
    MuiSwitch as Switch,
    DateRange,
    styled,
    Calendar,
    type Range,
} from '@toeverything/components/ui';

export default ({ onValueChange, initialValue }: ModifyPanelContentProps) => {
    const [dateTime, setDateTime] = useState<Date | null>(
        initialValue && !Array.isArray(initialValue.value)
            ? new Date(initialValue.value as number)
            : null
    );

    const [isRange, setIsRange] = useState<boolean>(
        Array.isArray(initialValue?.value) || false
    );

    const [dateRange, setDateRange] = useState<Range[]>([
        {
            startDate:
                initialValue && Array.isArray(initialValue.value)
                    ? new Date(initialValue.value[0])
                    : new Date(),
            endDate:
                initialValue && Array.isArray(initialValue.value)
                    ? new Date(initialValue.value[1])
                    : null,
            key: 'selection',
        },
    ]);

    return (
        <>
            {!initialValue && (
                <StyledSwitchContainer>
                    <StyledSwitchLabel>Use Date Range</StyledSwitchLabel>
                    <Switch
                        size="small"
                        onChange={(e, checked) => {
                            setIsRange(checked);
                        }}
                    />
                </StyledSwitchContainer>
            )}

            <StyledDateContainer
                onClick={e => {
                    e.stopPropagation();
                    e.preventDefault();
                }}
            >
                {isRange ? (
                    <DateRange
                        // editableDateInputs={true}
                        onChange={({ selection }) => {
                            const { startDate, endDate } = selection;
                            setDateRange([selection]);

                            if (startDate && endDate) {
                                onValueChange([
                                    startDate.getTime(),
                                    endDate.getTime(),
                                ]);
                            }
                        }}
                        moveRangeOnFirstSelection={false}
                        ranges={dateRange}
                    />
                ) : (
                    <Calendar
                        date={dateTime}
                        onChange={date => {
                            setDateTime(date);
                            date && onValueChange(date.getTime());
                        }}
                    />
                )}
            </StyledDateContainer>
        </>
    );
};

const StyledSwitchContainer = styled('div')`
    display: flex;
    align-items: center;
    margin-bottom: 12px;
`;
const StyledSwitchLabel = styled('span')`
    font-size: 14px;
    margin-right: 10px;
`;

/**
 *  DateRange & Calendar width is calc by their container width, but include container`s padding,
 *  and this calc width style is just right
 *  so there have to set margin negative
 * **/
const StyledDateContainer = styled('div')`
    margin-left: -24px;
`;
